-- Menyamakan status pesanan dengan dashboard (diantar, tiba-di-pos, komplain).
ALTER TABLE dashboard_orders MODIFY status ENUM('pending','perlu-dikemas','diproses','siap-jemput','sedang-dikemas','dikirim','diantar','tiba-di-pos','komplain','selesai','dibatalkan') NOT NULL DEFAULT 'pending';
