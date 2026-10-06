const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

function tokenFor(user) {
  return jwt.sign({ id:user.id, email:user.email, phone:user.phone, role:user.role }, process.env.JWT_SECRET, { expiresIn:'7d' });
}

async function register(req,res){
  try {
    const { name, email, phone, password, confirmPassword } = req.body;
    if(!name || !email || !phone || !password || !confirmPassword) return res.status(400).json({success:false,message:'Semua data wajib diisi.'});
    if(password !== confirmPassword) return res.status(400).json({success:false,message:'Konfirmasi password tidak cocok.'});
    if(password.length < 6) return res.status(400).json({success:false,message:'Password minimal 6 karakter.'});
    const normalizedEmail=String(email).trim().toLowerCase();
    const normalizedPhone=String(phone).trim();
    const [exists]=await pool.execute('SELECT id,email,phone FROM users WHERE email=? OR phone=? LIMIT 1',[normalizedEmail,normalizedPhone]);
    if(exists.length){
      if(exists[0].email===normalizedEmail) return res.status(409).json({success:false,message:'Email sudah terdaftar.'});
      return res.status(409).json({success:false,message:'Nomor telepon sudah terdaftar.'});
    }
    const hash=await bcrypt.hash(password,10);
    const [result]=await pool.execute('INSERT INTO users(name,email,phone,password) VALUES(?,?,?,?)',[String(name).trim(),normalizedEmail,normalizedPhone,hash]);
    const user={id:result.insertId,name:String(name).trim(),email:normalizedEmail,phone:normalizedPhone,role:'user'};
    return res.status(201).json({success:true,message:'Pendaftaran berhasil.',data:user,token:tokenFor(user)});
  }catch(error){console.error(error);return res.status(500).json({success:false,message:'Registrasi gagal.',error:error.message});}
}

async function login(req,res){
  try{
    const identifier=req.body.emailOrPhone ?? req.body.email ?? req.body.phone;
    const {password}=req.body;
    if(!identifier || !password) return res.status(400).json({success:false,message:'Email/nomor HP dan password wajib diisi.'});
    const value=String(identifier).trim();
    const [rows]=await pool.execute('SELECT id,name,email,phone,password,role FROM users WHERE email=? OR phone=? LIMIT 1',[value.toLowerCase(),value]);
    if(!rows.length) return res.status(401).json({success:false,message:'Email atau password salah.'});
    const user=rows[0];
    const ok=await bcrypt.compare(password,user.password);
    if(!ok) return res.status(401).json({success:false,message:'Email atau password salah.'});
    const safe={id:user.id,name:user.name,email:user.email,phone:user.phone,role:user.role};
    return res.json({success:true,message:'Login berhasil.',data:safe,token:tokenFor(safe)});
  }catch(error){console.error(error);return res.status(500).json({success:false,message:'Login gagal.',error:error.message});}
}

async function forgotPassword(req,res){
  try{
    const email=String(req.body.email||'').trim().toLowerCase();
    if(!email) return res.status(400).json({success:false,message:'Email wajib diisi.'});
    const [rows]=await pool.execute('SELECT id,email FROM users WHERE email=? LIMIT 1',[email]);
    if(!rows.length) return res.status(404).json({success:false,message:'Email tidak terdaftar.'});
    return res.json({success:true,message:'Instruksi pemulihan password akan dikirim ke email yang terdaftar.',data:{email}});
  }catch(error){return res.status(500).json({success:false,message:'Gagal memproses lupa password.',error:error.message});}
}

module.exports={register,login,forgotPassword};
