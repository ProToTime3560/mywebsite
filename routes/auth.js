const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // UUID 라이브러리 추가

// Multer 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userFolder = req.session.user.user_folder;
        const userDir = path.join(__dirname, '../uploads', userFolder);

        // 폴더가 없으면 재귀적으로 폴더 생성
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }

        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const uniqueFilename = crypto.randomBytes(16).toString('hex'); // 32-character unique filename without extension
        cb(null, uniqueFilename);
    }
});

const upload = multer({ storage: storage });

// 로그인 여부를 확인하는 미들웨어
function isLoggedIn(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

function isNotLoggedIn(req, res, next) {
    if (!req.session.user) {
        next();
    } else {
        res.redirect('/home');
    }
}

// 루트 경로('/')에 대한 라우트 설정
router.get('/', (req, res) => {
    res.redirect('/home/');
});

// 약관 페이지
router.get('/register', (req, res) => {
    res.render('terms');
});

// 게시판 페이지 렌더링
router.get('/noticeboard', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        const [results] = await db.query('SELECT * FROM posts');
        res.render('noticeboard', { user: req.session.user, posts: results });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 회원가입 세부 정보 페이지
router.get('/register-details', (req, res) => {
    res.render('register_details');
});

router.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
});

// 인증 코드 발송 라우트
router.post('/send-auth-code', async (req, res) => {
    const { email } = req.body;
    const authCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const expiry = new Date(Date.now() + 5 * 60000); // 5분 후 만료

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'afagamestudio@gmail.com',
            pass: process.env.SMTP_PASSWORD
        }
    });

    const mailOptions = {
        from: 'ProToTimeCloudStorage@gmail.com',
        to: email,
        subject: 'Email Verification Code',
        html: `<p>Your verification code is: ${authCode}</p>`
    };

    try {
        const [results] = await db.execute('SELECT * FROM auth_code_table WHERE user_email = ?', [email]);
        if (results.length > 0) {
            await db.execute('UPDATE auth_code_table SET auth_code = ?, code_expiry = ? WHERE user_email = ?', [authCode, expiry, email]);
        } else {
            await db.execute('INSERT INTO auth_code_table (user_email, auth_code, code_expiry) VALUES (?, ?, ?)', [email, authCode, expiry]);
        }

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
                return res.status(500).json({ error: 'Failed to send email' });
            } else {
                res.status(200).json({ success: 'Verification code sent', expiry: expiry });
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 회원가입시 이메일 중복 확인
router.post('/email-duplication-check', async (req, res) => {
    const { email } = req.body;
    try {
        const [results] = await db.execute('SELECT * FROM userinformation WHERE user_email = ?', [email]);
        if (results.length > 0) {
            return res.status(400).json({ exists: true });
        } else {
            return res.status(200).json({ exists: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 이메일 인증 코드 확인
router.post('/verify-auth-code', async (req, res) => {
    const { email, authCode } = req.body;

    try {
        const [results] = await db.execute('SELECT * FROM auth_code_table WHERE user_email = ? AND auth_code = ? AND code_expiry > NOW()', [email, authCode]);
        if (results.length > 0) {
            res.status(200).json({ success: 'Email verified' });
        } else {
            res.status(400).json({ error: 'Invalid or expired code' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 회원가입 요청 처리
router.post('/register-start', async (req, res) => {
    const { user_id, user_password, confirm_password, user_email } = req.body;

    if (user_password !== confirm_password) {
        return res.json({ success: false, error: '비밀번호가 일치하지 않습니다.' });
    }

    const hashedPassword = bcrypt.hashSync(user_password, 10);
    const userFolder = uuidv4(); // UUID를 폴더 이름으로 사용

    try {
        await db.query('INSERT INTO userinformation (user_id, user_password, user_email, user_folder) VALUES (?, ?, ?, ?)', [user_id, hashedPassword, user_email, userFolder]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: '회원가입에 실패했습니다.' });
    }
});

// ID 중복 확인
router.post('/check-id', async (req, res) => {
    const { user_id } = req.body;

    try {
        const [results] = await db.execute('SELECT * FROM userinformation WHERE user_id = ?', [user_id]);
        if (results.length > 0) {
            res.status(400).json({ error: 'ID already exists' });
        } else {
            res.status(200).json({ success: 'ID is available' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 비밀번호 변경 요청 처리
router.post('/change-password', async (req, res) => {
    const { email, new_password, confirm_password } = req.body;

    if (new_password !== confirm_password) {
        return res.json({ success: false, error: '비밀번호가 일치하지 않습니다.' });
    }

    const hashedPassword = bcrypt.hashSync(new_password, 10);

    try {
        const [result] = await db.query('UPDATE userinformation SET user_password = ? WHERE user_email = ?', [hashedPassword, email]);
        if (result.affectedRows > 0) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: '이메일이 존재하지 않습니다.' });
        }
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: '비밀번호 변경에 실패했습니다.' });
    }
});



// 로그인 페이지 렌더링
router.get('/login', (req, res) => {
    res.render('login');
});

// 로그인 요청 처리
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [results] = await db.query('SELECT * FROM userinformation WHERE user_email = ?', [email]);
        if (results.length > 0) {
            const user = results[0];
            // 비밀번호 검증
            const isMatch = await bcrypt.compare(password, user.user_password);
            if (isMatch) {
                // 로그인 성공
                req.session.user = user;
                res.json({ success: true });
            } else {
                // 비밀번호 불일치
                res.json({ success: false });
            }
        } else {
            // 이메일 불일치
            res.json({ success: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 로그아웃 요청 처리
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) throw err;
        res.redirect('/login');
    });
});

// 대시보드 페이지 렌더링
router.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('dashboard', { user: req.session.user });
});

// 홈 페이지 렌더링
router.get('/home', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        const [results] = await db.query('SELECT user_folder FROM userinformation WHERE user_email = ?', [req.session.user.user_email]);
        if (results.length > 0) {
            req.session.user.user_folder = results[0].user_folder;
            res.render('home', { user: req.session.user });
        } else {
            res.redirect('/login');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 파일 업로드 처리
router.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    const userId = req.session.user.user_id;
    const fileType = path.extname(file.originalname).slice(1); // 파일 확장자 추출
    if (file) {
        try {
            await db.query('INSERT INTO uploaded_files (user_id, stored_filename, original_filename, file_path, file_type) VALUES (?, ?, ?, "", ?)', [userId, file.filename, file.originalname, fileType]);
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.json({ success: false });
        }
    } else {
        res.json({ success: false });
    }
});

// 파일 리스트 가져오기
router.get('/files', async (req, res) => {
    const userId = req.session.user.user_id;
    try {
        const [results] = await db.query('SELECT * FROM uploaded_files WHERE user_id = ?', [userId]);
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 파일 다운로드 처리
router.get('/download/:id', async (req, res) => {
    const fileId = req.params.id;
    try {
        // uploaded_files 테이블에서 파일 정보를 가져옴
        const [fileResults] = await db.query('SELECT * FROM uploaded_files WHERE id = ?', [fileId]);
        if (fileResults.length > 0) {
            const file = fileResults[0];
            // 파일을 업로드한 사용자의 정보를 가져옴
            const [userResults] = await db.query('SELECT * FROM userinformation WHERE user_id = ?', [file.user_id]);
            if (userResults.length > 0) {
                const user = userResults[0];
                const userFolder = user.user_folder; // 실제 파일이 저장된 사용자의 폴더
                const filepath = path.join(__dirname, '../uploads', userFolder, file.stored_filename);
                res.download(filepath, file.original_filename);
            } else {
                res.status(404).send('파일을 업로드한 사용자를 찾을 수 없습니다.');
            }
        } else {
            res.status(404).send('파일을 찾을 수 없습니다.');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


// 파일 삭제 처리
router.delete('/delete/:id', async (req, res) => {
    const fileId = req.params.id;
    try {
        const [results] = await db.query('SELECT * FROM uploaded_files WHERE id = ?', [fileId]);
        if (results.length > 0) {
            const file = results[0];
            const userFolder = req.session.user.user_folder;
            const filepath = path.join(__dirname, '../uploads', userFolder, file.stored_filename);
            fs.unlink(filepath, async (err) => {
                if (err) {
                    return res.json({ success: false });
                }
                await db.query('DELETE FROM uploaded_files WHERE id = ?', [fileId]);
                res.json({ success: true });
            });
        } else {
            res.json({ success: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 파일 공유 처리
router.post('/share', async (req, res) => {
    const { fileId, sharedUserId, originalFilename } = req.body;
    const sharedByUserId = req.session.user.user_id; // 현재 세션 유저의 ID 가져오기

    try {
        await db.query(
            'INSERT INTO file_shares (file_id, shared_user_id, shared_by_user_id, original_filename) VALUES (?, ?, ?, ?)', 
            [fileId, sharedUserId, sharedByUserId, originalFilename]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// 기타 라우트 핸들러들...

module.exports = router;


// 공유된 파일 조회
router.get('/shared-files', async (req, res) => {
    const userId = req.session.user.user_id;
    try {
        const [results] = await db.query(`
            SELECT uf.* FROM uploaded_files uf
            JOIN file_shares fs ON uf.id = fs.file_id
            WHERE fs.shared_user_id = ?
        `, [userId]);
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

//공유삭제
router.delete('/remove-share/:fileId', async (req, res) => {
    const userId = req.session.user.user_id;
    const fileId = req.params.fileId;

    try {
        await db.query('DELETE FROM file_shares WHERE file_id = ? AND shared_user_id = ?', [fileId, userId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


module.exports = router;
