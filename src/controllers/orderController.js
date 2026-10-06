const {pool}=require('../config/database');

function mapOrder(o, items) {
  return {
    id: o.order_code,
    seller: o.seller,
    dateLabel: new Date(o.created_at).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }) + ' WIB',
    status: o.status,
    lines: items.map(i => ({ name:i.name, variant:i.variant, price:Number(i.price), qty:i.qty, image:i.image || '' })),
    total: Number(o.total),
    paymentLabel: o.payment_label,
    courierTitle: o.courier_title,
    courierInfo: o.courier_info,
    receiverName: o.receiver_name,
    receiverPhone: o.receiver_phone,
    deliveryAddress: o.delivery_address,
    deliveryNote: o.delivery_note || '',
    paymentStatus: o.payment_status,
    deliveryMethod: o.delivery_method,
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.delivery_fee),
    discount: Number(o.discount)
  };
}

async function getOrders(req,res){try{const [orders]=await pool.execute('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC',[req.user.id]);const out=[];for(const o of orders){const [items]=await pool.execute('SELECT name,variant,price,qty,image FROM order_items WHERE order_id=? ORDER BY id',[o.id]);out.push(mapOrder(o,items));}res.json({success:true,data:out});}catch(e){res.status(500).json({success:false,message:'Gagal mengambil pesanan.',error:e.message});}}
async function getOrderById(req,res){try{const [orders]=await pool.execute('SELECT * FROM orders WHERE order_code=? AND user_id=? LIMIT 1',[req.params.id,req.user.id]);if(!orders.length)return res.status(404).json({success:false,message:'Pesanan tidak ditemukan.'});const [items]=await pool.execute('SELECT name,variant,price,qty,image FROM order_items WHERE order_id=?',[orders[0].id]);res.json({success:true,data:mapOrder(orders[0],items)});}catch(e){res.status(500).json({success:false,message:'Gagal mengambil detail pesanan.',error:e.message});}}
async function createOrder(req,res){
  const conn=await pool.getConnection();
  try{
    const {items,receiverName,receiverPhone,deliveryAddress,deliveryNote='',paymentMethod='qris',paymentLabel,deliveryMethod='kurir',courierTitle,courierInfo,discount=0,deliveryFee}=req.body;
    if(!Array.isArray(items)||!items.length)return res.status(400).json({success:false,message:'Item pesanan wajib diisi.'});
    if(!receiverName||!receiverPhone||!deliveryAddress)return res.status(400).json({success:false,message:'Data penerima wajib diisi.'});
    await conn.beginTransaction();
    let subtotal=0;let seller='';const normalized=[];
    for(const item of items){
      const [p]=await conn.execute('SELECT * FROM products WHERE public_id=? FOR UPDATE',[item.productId||item.id]);
      if(!p.length)throw new Error(`Produk ${item.productId||item.id} tidak ditemukan.`);
      const product=p[0];const qty=Number(item.quantity||item.qty||1);if(qty<1||qty>product.stock)throw new Error(`Stok ${product.name} tidak mencukupi.`);
      subtotal+=Number(product.price)*qty;seller=seller||product.seller;normalized.push({product,qty});
    }
    const fee=deliveryFee!==undefined?Number(deliveryFee):(deliveryMethod==='kurir'?5000:0);const disc=Math.max(0,Number(discount));const total=Math.max(0,subtotal+fee-disc);
    if(paymentMethod==='saldo'){
      const [u]=await conn.execute('SELECT wallet_balance FROM users WHERE id=? FOR UPDATE',[req.user.id]);
      if(!u.length||Number(u[0].wallet_balance)<total)throw new Error('Saldo PasarDesa tidak mencukupi.');
      await conn.execute('UPDATE users SET wallet_balance=wallet_balance-? WHERE id=?',[total,req.user.id]);
      await conn.execute('INSERT INTO wallet_transactions(user_id,type,amount,description) VALUES(?,?,?,?)',[req.user.id,'payment',total,'Pembayaran pesanan PasarDesa']);
    }
    const code=`PSD-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
    const paid=paymentMethod==='cod'?'belum_dibayar':'dibayar';const label=paymentLabel||({qris:'QRIS Desa / Transfer BUMDes',cod:'COD BUMDes',saldo:'Saldo Lunas'}[paymentMethod]||paymentMethod);
    const [r]=await conn.execute(`INSERT INTO orders(order_code,user_id,seller,subtotal,delivery_fee,discount,total,payment_method,payment_label,payment_status,delivery_method,courier_title,courier_info,receiver_name,receiver_phone,delivery_address,delivery_note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[code,req.user.id,seller,subtotal,fee,disc,total,paymentMethod,label,paid,deliveryMethod,courierTitle||null,courierInfo||null,receiverName,receiverPhone,deliveryAddress,deliveryNote]);
    for(const x of normalized){await conn.execute('INSERT INTO order_items(order_id,product_id,name,variant,price,qty,image) VALUES(?,?,?,?,?,?,?)',[r.insertId,x.product.id,x.product.short_name,itemVariant(items,x.product.public_id),x.product.price,x.qty,x.product.image]);await conn.execute('UPDATE products SET stock=stock-? WHERE id=?',[x.qty,x.product.id]);}
    await conn.execute('DELETE c FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? AND c.selected=1 AND p.public_id IN (?)',[req.user.id,normalized.map(x=>x.product.public_id)]);
    await conn.execute('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)',[req.user.id,'Pesanan berhasil dibuat',`Pesanan ${code} sedang diproses penjual.`]);
    await conn.commit();
    const [o]=await pool.execute('SELECT * FROM orders WHERE id=?',[r.insertId]);const [oi]=await pool.execute('SELECT name,variant,price,qty,image FROM order_items WHERE order_id=?',[r.insertId]);res.status(201).json({success:true,message:'Pesanan berhasil dibuat.',data:mapOrder(o[0],oi)});
  }catch(e){await conn.rollback();res.status(400).json({success:false,message:e.message});}finally{conn.release();}
}
function itemVariant(items,id){const i=items.find(x=>(x.productId||x.id)===id);return i?.variant||'';}
async function updateOrderStatus(req,res){try{const allowed=['diproses','dikirim','selesai','dibatalkan'];if(!allowed.includes(req.body.status))return res.status(400).json({success:false,message:'Status tidak valid.'});const [r]=await pool.execute('UPDATE orders SET status=? WHERE order_code=? AND user_id=?',[req.body.status,req.params.id,req.user.id]);if(!r.affectedRows)return res.status(404).json({success:false,message:'Pesanan tidak ditemukan.'});res.json({success:true,message:'Status pesanan diperbarui.'});}catch(e){res.status(500).json({success:false,message:'Gagal memperbarui status.',error:e.message});}}
module.exports={getOrders,getOrderById,createOrder,updateOrderStatus};
