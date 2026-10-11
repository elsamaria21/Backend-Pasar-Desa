const {
  pool,
} = require("../config/database");


function getUserId(req) {
  return (
    req.user?.id ||
    req.user?.user_id ||
    req.user?.userId ||
    null
  );
}


// =====================================================
// SEARCH
// =====================================================

async function searchProducts(
  req,
  res
) {
  try {
    const keyword =
      (
        req.query.keyword ||
        ""
      )
        .trim()
        .toLowerCase();

    const userId =
      getUserId(req);

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message:
          "Keyword wajib diisi.",
      });
    }


    // ============================================
    // SIMPAN HISTORY
    // ============================================

    if (userId) {
      await pool.execute(
        `
        INSERT INTO search_history
        (
          user_id,
          keyword,
          search_count
        )

        VALUES
        (?, ?, 1)

        ON DUPLICATE KEY UPDATE

          search_count =
            search_count + 1,

          last_searched_at =
            NOW()
        `,
        [
          userId,
          keyword,
        ]
      );
    }


    // ============================================
    // SEARCH PRODUCT
    // ============================================

    const pattern =
      `%${keyword}%`;

    const [
      products,
    ] = await pool.execute(
      `
      SELECT
        p.*,
        c.name AS category_name

      FROM products p

      LEFT JOIN categories c
        ON c.id = p.category_id

      WHERE
        LOWER(p.name)
          LIKE ?

        OR

        LOWER(
          COALESCE(
            p.description,
            ''
          )
        )
          LIKE ?

      ORDER BY

        CASE
          WHEN LOWER(p.name)
            = ?
          THEN 1

          WHEN LOWER(p.name)
            LIKE ?
          THEN 2

          ELSE 3
        END,

        p.id DESC
      `,
      [
        pattern,
        pattern,
        keyword,
        `${keyword}%`,
      ]
    );


    return res.json({
      success: true,

      keyword,

      total:
        products.length,

      data:
        products,
    });
  } catch (error) {
    console.error(
      "SEARCH ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Pencarian gagal.",
      error:
        error.message,
    });
  }
}


// =====================================================
// HISTORY
// =====================================================

async function getHistory(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "User belum login.",
      });
    }

    const [
      history,
    ] = await pool.execute(
      `
      SELECT
        id,
        keyword,
        search_count,
        last_searched_at

      FROM search_history

      WHERE user_id = ?

      ORDER BY
        last_searched_at DESC

      LIMIT 20
      `,
      [userId]
    );

    return res.json({
      success: true,
      data:
        history,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Gagal mengambil history.",
      error:
        error.message,
    });
  }
}


// =====================================================
// SUGGESTION
// =====================================================

async function getSuggestions(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    const q =
      (
        req.query.q ||
        ""
      )
        .trim()
        .toLowerCase();

    if (!userId) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const [
      suggestions,
    ] = await pool.execute(
      `
      SELECT
        keyword,
        search_count

      FROM search_history

      WHERE
        user_id = ?

        AND keyword LIKE ?

      ORDER BY

        search_count DESC,

        last_searched_at DESC

      LIMIT 10
      `,
      [
        userId,
        `${q}%`,
      ]
    );

    return res.json({
      success: true,
      data:
        suggestions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Gagal mengambil suggestion.",
      error:
        error.message,
    });
  }
}


// =====================================================
// POPULAR SEARCH
// =====================================================

async function getPopularSearches(
  req,
  res
) {
  try {
    const [
      popular,
    ] = await pool.execute(
      `
      SELECT
        keyword,

        SUM(
          search_count
        ) AS total_search

      FROM search_history

      GROUP BY keyword

      ORDER BY
        total_search DESC

      LIMIT 10
      `
    );

    return res.json({
      success: true,
      data:
        popular,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Gagal mengambil pencarian populer.",
      error:
        error.message,
    });
  }
}


// =====================================================
// RECOMMENDATION
// =====================================================

async function getRecommendations(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "User belum login.",
      });
    }

    const [
      history,
    ] = await pool.execute(
      `
      SELECT
        keyword,
        search_count

      FROM search_history

      WHERE user_id = ?

      ORDER BY

        search_count DESC,

        last_searched_at DESC

      LIMIT 5
      `,
      [userId]
    );


    // ============================================
    // BELUM ADA HISTORY
    // ============================================

    if (
      history.length ===
      0
    ) {
      const [
        products,
      ] = await pool.execute(
        `
        SELECT *
        FROM products
        ORDER BY id DESC
        LIMIT 10
        `
      );

      return res.json({
        success: true,
        type:
          "latest",
        data:
          products,
      });
    }


    // ============================================
    // BUAT KEYWORD
    // ============================================

    const keywords =
      history.map(
        item =>
          item.keyword
      );


    const conditions =
      keywords.map(
        () => `
        LOWER(p.name)
        LIKE ?
        OR
        LOWER(
          COALESCE(
            p.description,
            ''
          )
        )
        LIKE ?
        `
      );


    const params = [];

    keywords.forEach(
      keyword => {
        params.push(
          `%${keyword}%`
        );

        params.push(
          `%${keyword}%`
        );
      }
    );


    const [
      products,
    ] = await pool.execute(
      `
      SELECT
        p.*,
        c.name AS category_name

      FROM products p

      LEFT JOIN categories c
        ON c.id =
          p.category_id

      WHERE
        ${conditions
          .map(
            item =>
              `(${item})`
          )
          .join(" OR ")}

      ORDER BY
        p.id DESC

      LIMIT 20
      `,
      params
    );


    return res.json({
      success: true,

      type:
        "personalized",

      keywords:
        history,

      data:
        products,
    });
  } catch (error) {
    console.error(
      "RECOMMENDATION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Gagal mengambil rekomendasi.",
      error:
        error.message,
    });
  }
}


// =====================================================
// DELETE HISTORY
// =====================================================

async function deleteHistory(
  req,
  res
) {
  try {
    const userId =
      getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "User belum login.",
      });
    }

    await pool.execute(
      `
      DELETE FROM search_history
      WHERE user_id = ?
      `,
      [userId]
    );

    return res.json({
      success: true,
      message:
        "Riwayat pencarian berhasil dihapus.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "Gagal menghapus history.",
      error:
        error.message,
    });
  }
}


module.exports = {
  searchProducts,
  getHistory,
  getSuggestions,
  getPopularSearches,
  getRecommendations,
  deleteHistory,
};