// middlewares/auth.js

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

module.exports = { isLoggedIn, isNotLoggedIn };
