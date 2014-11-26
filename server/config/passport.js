// config/passport.js
//
// This configures our authentication layer - currently only local auth.
//
//  One important thing here: this is where we implement the connection to our backend
//   persistency layer (mongoDB).
//
// From http://scotch.io/tutorials/javascript/easy-node-authentication-setup-and-local

// load all the things we need
var LocalStrategy   = require('passport-local').Strategy,
    dbs = require('../pouch-config');


// expose this function to our app using module.exports
module.exports = function(passport) {

    // =========================================================================
    // passport session setup ==================================================
    // =========================================================================
    // required for persistent login sessions
    // passport needs ability to serialize and unserialize users out of session

    // used to serialize the user for the session
    passport.serializeUser(function(user, done) {
        done(null, user._id);
    });

    // used to deserialize the user
    passport.deserializeUser(function(id, done) {
        dbs.users.get(id, function(err, user) {
            done(err, user);
        });
    });

 	// =========================================================================
    // LOCAL SIGNUP ============================================================
    // =========================================================================
    // we are using named strategies since we have one for login and one for signup
	// by default, if there was no name, it would just be called 'local'

    passport.use('local-signup', new LocalStrategy({
        // by default, local strategy uses username and password, we will override with email
        usernameField : 'email',
        passwordField : 'password',
        passReqToCallback : true // allows us to pass back the entire request to the callback
    },
    function(req, email, password, done) {

        // asynchronous
        // User.findOne wont fire unless data is sent back
        process.nextTick(function() {

		// find a user whose email is the same as the forms email
		// we are checking to see if the user trying to login already exists
        var map = function(doc) {
                emit(doc.local.email)
                };

        dbs.users.query(map, { key: email, include_docs: true }, function(err, result) {
            // if there are any errors, return the error
            if (err)
                return done(err);

            // check to see if theres already a user with that email
            if (user.rows.length) {
                return done(null, false, req.flash('signupMessage', 'That email is already registered.'));
            } else {

				// if there is no user with that email
                // create the user
                var newUser = dbs.defaults.user;

                // set the user's local credentials
                newUser.local.email    = email;
                newUser.local.password = dbs.utils.users.generateHash(password);

				// save the user
                dbs.users.post(newUser,function(err, result) {
                    if (err)
                        throw err;
                    console.log(result)
                    return done(null, result);
                });
            }

        });    

        });

    }));
    
    // =========================================================================
    // LOCAL LOGIN =============================================================
    // =========================================================================
	// we are using named strategies since we have one for login and one for signup
	// by default, if there was no name, it would just be called 'local'

    passport.use('local-login', new LocalStrategy({
        // by default, local strategy uses username and password, we will override with email
        usernameField : 'email',
        passwordField : 'password',
        passReqToCallback : true // allows us to pass back the entire request to the callback
    },
    function(req, email, password, done) { // callback with email and password from our form
		// find a user whose email is the same as the forms email
		// we are checking to see if the user trying to login already exists
        var map = function(doc) {
                emit(doc.local.email)
                };

        dbs.users.query(map, { key: email, include_docs: true }, function(err, result) {
            // if there are any errors, return the error before anything else
            if (err)
                return done(err);
            
            console.log(result);
            
            // if no user is found, return the message
            if (result.rows.length != 1 )
                return done(null, false, req.flash('loginMessage', 'Username or password incorrect.'));
                // req.flash is the way to set flashdata using connect-flash
            var user = result.rows[0].doc;
            console.log(user);
            
            // if the user is found but the password is wrong
            if (!dbs.utils.users.validPassword(password, user.local.password))
                return done(null, false, req.flash('loginMessage', 'Username or password incorrect.'));
                // create the loginMessage and save it to session as flashdata

            // If the user is an admin, and the password is "admin", then
            // complain loudly
           if (user.role == 'admin' && dbs.utils.users.validPassword('admin', user.local.password))
                return done(null, user, req.flash('warningMessage', 'Your admin password is the default password, "admin". Please change this to something more secure! Most features will be disabled until your change your password, log out and log back in again.'));
 
            // all is well, return successful user
            return done(null, user);
        });

    }));


};
