const { pool } = require('../config/database');
const fs=require('fs');

function mapProduct(p, req){
  return {
    id:p.public_id,
    databaseId:p.id,
    name:p.name,
    shortName:p.short_name,
    seller:p.seller,
    category:p.category_name || '',
    price:Number(p.price),
    unit:p.unit || '',
    image:p.image ? (p.image.startsWith('http') ? p.image : `${req.protocol}://${req.get('host')}${p.image.startsWith('/')?'':'/'}${p.image}`) : '',
    rating:Number(p.rating),
    stock:Number(p.stock),
    description:p.description || '',
    sellerAddress:p.seller_address || ''
  };
}

async function getProducts(req,res){
  try{
    const params=[]; const where=[];
    if(req.query.category){where.push('c.name=?');params.push(req.query.category);}
    if(req.query.q){where.push('(LOWER(p.name) LIKE ? OR LOWER(p.short_name) LIKE ? OR LOWER(p.seller) LIKE ? OR LOWER(COALESCE(p.description,"")) LIKE ?)');const q=`%${String(req.query.q).toLowerCase()}%`;params.push(q,q,q,q);}
    if(req.query.inStock==='true') where.push('p.stock>0');
    const sql=`SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY p.created_at DESC,p.id DESC`;
    const [rows]=await pool.execute(sql,params);
    res.json({success:true,total:rows.length,data:rows.map(x=>mapProduct(x,req))});
  }catch(error){res.status(500).json({success:false,message:'Gagal mengambil produk.',error:error.message});}
}

async function getProductById(req,res){
  try{const [rows]=await pool.execute('SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.public_id=? LIMIT 1',[req.params.id]);if(!rows.length)return res.status(404).json({success:false,message:'Produk tidak ditemukan.'});res.json({success:true,data:mapProduct(rows[0],req)});}catch(error){res.status(500).json({success:false,message:'Gagal mengambil detail produk.',error:error.message});}
}

async function createProduct(req,res){
  try{
    const {name,shortName,short_name,seller,category,categoryId,description,price,unit,rating,stock,sellerAddress}=req.body;
    if(!name || !seller || price===undefined || stock===undefined) return res.status(400).json({success:false,message:'Nama, penjual, harga, dan stok wajib diisi.'});
    let category_id=categoryId||null;
    if(!category_id && category){const [c]=await pool.execute('SELECT id FROM categories WHERE name=? LIMIT 1',[category]);category_id=c[0]?.id||null;}
    const publicId=`prd-${Date.now()}-${Math.round(Math.random()*99999)}`;
    const image=req.file?`/uploads/products/${req.file.filename}`:(req.body.image||null);
    const [result]=await pool.execute(`INSERT INTO products(public_id,name,short_name,seller,seller_address,category_id,description,price,unit,image,rating,stock,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,[publicId,name,String(shortName||short_name||name).trim(),seller,sellerAddress||null,category_id,description||'',Number(price),unit||'',image,Number(rating||0),Number(stock),req.user.id]);
    const [rows]=await pool.execute('SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?',[result.insertId]);
    res.status(201).json({success:true,message:'Produk berhasil ditambahkan.',data:mapProduct(rows[0],req)});
  }catch(error){res.status(500).json({success:false,message:'Gagal menambahkan produk.',error:error.message});}
}

async function updateProduct(req,res){
  try{
    const [old]=await pool.execute('SELECT * FROM products WHERE public_id=? LIMIT 1',[req.params.id]);
    if(!old.length)return res.status(404).json({success:false,message:'Produk tidak ditemukan.'});
    if(old[0].user_id!==req.user.id && req.user.role!=='admin')return res.status(403).json({success:false,message:'Tidak punya akses mengubah produk ini.'});
    const b=req.body; let category_id=b.categoryId||null;
    if(!category_id&&b.category){const [c]=await pool.execute('SELECT id FROM categories WHERE name=? LIMIT 1',[b.category]);category_id=c[0]?.id||null;}
    let image=old[0].image;if(req.file)image=`/uploads/products/${req.file.filename}`;else if(b.image!==undefined)image=b.image;
    await pool.execute(`UPDATE products SET name=?,short_name=?,seller=?,seller_address=?,category_id=?,description=?,price=?,unit=?,image=?,rating=?,stock=? WHERE public_id=?`,[b.name??old[0].name,b.shortName??b.short_name??old[0].short_name,b.seller??old[0].seller,b.sellerAddress??old[0].seller_address,category_id,b.description??old[0].description,Number(b.price??old[0].price),b.unit??old[0].unit,image,Number(b.rating??old[0].rating),Number(b.stock??old[0].stock),req.params.id]);
    const [rows]=await pool.execute('SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.public_id=?',[req.params.id]);res.json({success:true,message:'Produk berhasil diperbarui.',data:mapProduct(rows[0],req)});
  }catch(error){res.status(500).json({success:false,message:'Gagal memperbarui produk.',error:error.message});}
}

async function deleteProduct(req,res){
  try{const [rows]=await pool.execute('SELECT * FROM products WHERE public_id=? LIMIT 1',[req.params.id]);if(!rows.length)return res.status(404).json({success:false,message:'Produk tidak ditemukan.'});if(rows[0].user_id!==req.user.id&&req.user.role!=='admin')return res.status(403).json({success:false,message:'Tidak punya akses menghapus produk ini.'});await pool.execute('DELETE FROM products WHERE public_id=?',[req.params.id]);res.json({success:true,message:'Produk berhasil dihapus.'});}catch(error){res.status(500).json({success:false,message:'Gagal menghapus produk.',error:error.message});}
}

module.exports={getProducts,getProductById,createProduct,updateProduct,deleteProduct};
