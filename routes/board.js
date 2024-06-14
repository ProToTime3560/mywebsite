const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isLoggedIn } = require('../middlewares/auth');

// 게시글 목록 조회
router.get('/posts', async (req, res) => {
    try {
        const [posts] = await db.query('SELECT * FROM posts ORDER BY createdAt DESC');
        res.render('noticeboard', { user: req.session.user, posts });
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// 게시글 작성
router.post('/posts', isLoggedIn, async (req, res) => {
    const { title, content } = req.body;
    const userId = req.session.user.user_id;

    try {
        await db.query('INSERT INTO posts (title, content, author_id) VALUES (?, ?, ?)', [title, content, userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// 특정 게시글 조회
router.get('/posts/:id', async (req, res) => {
    const postId = req.params.id;

    try {
        const [postResults] = await db.query('SELECT * FROM posts WHERE id = ?', [postId]);
        const [commentResults] = await db.query('SELECT * FROM comments WHERE post_id = ? ORDER BY createdAt ASC', [postId]);

        if (postResults.length > 0) {
            const post = postResults[0];
            res.render('post_detail', { user: req.session.user, post, comments: commentResults });
        } else {
            res.status(404).json({ error: 'Post not found' });
        }
    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({ error: 'Failed to fetch post' });
    }
});

// 게시글 삭제
router.delete('/posts/:id', isLoggedIn, async (req, res) => {
    const postId = req.params.id;
    const userId = req.session.user.user_id;

    try {
        const [postResults] = await db.query('SELECT * FROM posts WHERE id = ?', [postId]);
        if (postResults.length > 0) {
            const post = postResults[0];
            if (post.author_id !== userId) {
                return res.status(403).json({ error: 'Permission denied' });
            }

            await db.query('DELETE FROM posts WHERE id = ?', [postId]);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Post not found' });
        }
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// 댓글 작성
router.post('/posts/:id/comments', isLoggedIn, async (req, res) => {
    const postId = req.params.id;
    const { content } = req.body;
    const userId = req.session.user.user_id;

    try {
        await db.query('INSERT INTO comments (post_id, content, author_id) VALUES (?, ?, ?)', [postId, content, userId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error creating comment:', error);
        res.status(500).json({ error: 'Failed to create comment' });
    }
});

module.exports = router;
