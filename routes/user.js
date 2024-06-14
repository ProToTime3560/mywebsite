const express = require('express');
const router = express.Router();
const db = require('../config/db'); // db.js를 import

// 사용자 대시보드 라우트
router.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    // 세션에 저장된 사용자 정보로 대시보드 렌더링
    const userId = req.session.user.user_id;
    db.query('SELECT * FROM userInformation WHERE user_id = ?', [userId], (err, result) => {
        if (err) throw err;
        if (result.length > 0) {
            res.render('dashboard', { user: result[0] });
        } else {
            res.redirect('/login');
        }
    });
});

// 로그아웃 라우트
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) throw err;
        res.redirect('/login');
    });
});

module.exports = router;
