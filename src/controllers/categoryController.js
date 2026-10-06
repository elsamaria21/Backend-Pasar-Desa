const {pool}=require('../config/database');
async function getCategories(req,res){try{const [rows]=await pool.execute('SELECT id,name FROM categories ORDER BY name ASC');res.json({success:true,data:rows});}catch(e){res.status(500).json({success:false,message:'Gagal mengambil kategori.',error:e.message});}}
async function createCategory(req,res){try{const name=String(req.body.name||'').trim();if(!name)return res.status(400).json({success:false,message:'Nama kategori wajib diisi.'});const [r]=await pool.execute('INSERT INTO categories(name) VALUES(?)',[name]);res.status(201).json({success:true,data:{id:r.insertId,name}});}catch(e){res.status(500).json({success:false,message:'Gagal membuat kategori.',error:e.message});}}
module.exports={getCategories,createCategory};
