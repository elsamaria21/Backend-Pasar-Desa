const fs=require('fs');
const path=require('path');
const OpenAI=require('openai');

function mime(file){const e=path.extname(file).toLowerCase();return e==='.png'?'image/png':e==='.webp'?'image/webp':'image/jpeg';}
async function generateProduct(req,res){
  if(!req.file)return res.status(400).json({success:false,message:'Foto produk wajib diupload.'});
  if(!process.env.OPENAI_API_KEY){return res.status(503).json({success:false,message:'AI belum dikonfigurasi. Isi OPENAI_API_KEY di .env.'});}
  try{
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const base64=fs.readFileSync(req.file.path).toString('base64');
    const response=await client.responses.create({model:process.env.OPENAI_MODEL||'gpt-4o-mini',instructions:'Kamu membantu penjual UMKM PasarDesa. Analisis foto produk dan berikan JSON valid {"name":"...","description":"..."}. Jangan mengarang harga, berat, ukuran, merek, sertifikasi, atau manfaat medis yang tidak terlihat.',input:[{role:'user',content:[{type:'input_text',text:'Buat nama dan deskripsi produk Bahasa Indonesia yang natural berdasarkan foto ini.'},{type:'input_image',image_url:`data:${mime(req.file.originalname)};base64,${base64}`}] } ]});
    let text=(response.output_text||'').replace(/```json|```/g,'').trim();let data;try{data=JSON.parse(text);}catch{data={name:'Produk UMKM',description:text};}
    const image=`${req.protocol}://${req.get('host')}/uploads/products/${req.file.filename}`;
    res.json({success:true,message:'AI berhasil menganalisis produk.',data:{name:data.name||'Produk UMKM',description:data.description||'',image,fileName:req.file.filename}});
  }catch(e){try{fs.unlinkSync(req.file.path);}catch{}res.status(500).json({success:false,message:'Gagal memproses foto dengan AI.',error:e.message});}
}
module.exports={generateProduct};
