const express = require('express')
const router = express.Router()

const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const mysql = require('mysql')

const cookies = require('cookie-parser')
router.use(cookies())
   
require('dotenv').config()

const cors = require('cors')
router.use(cors({
    credentials: true,
    allowCredentials: true,
    origin: "https://638171cba04cfb2d43e70470--petmatcher.netlify.app"
}))

const authenticateToken = require('../middleware/authenticateToken')

var db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_NAME
})

db.on('error', err => {
    console.error(err)
})

function handleDisconnect() {
    db = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PW,
        database: process.env.DB_NAME
    }) // Recreate the connection, since the old one cannot be reused.
  
    db.connect(function(err) {              // The server is either down
      if(err) {                             // or restarting (takes a while sometimes).
        console.log('error when connecting to db:', err);
        setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
      }                                     // to avoid a hot loop, and to allow our node script to
    });                                     // process asynchronous requests in the meantime.
                                            // If you're also serving http, display a 503 error.
    
    db.on('error', function(err) {
      console.log('db error', err);
      if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
        handleDisconnect();                         // lost due to either server restart, or a
      } else {                                      // connnection idle timeout (the wait_timeout
        throw err;                                  // server variable configures this)
      }
    });
}
  
handleDisconnect();

const createAccessToken = (payload) => {
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '30s',
    })
}

router.get('/', (req, res) => {
    res.json({"great": "job!"})
})

router.post('/signup', async (req, res) => {

    const email = req.body.email;
    const username = req.body.username;

    /* basic checks */
    if (username === undefined || email === undefined || req.body.password === undefined)
        return res.status(406).json({ message: "username, email, password are required fields" })

    if (!email.includes("@"))
        return res.status(406).json({ message: "valid email required" })

    if (username.length < 3 || username.length > 15)
        return res.json({ message: "username must be 3-15 characters" })
 
    /* check if email already taken */
    db.query(`SELECT * FROM ${process.env.DB_NAME}.user WHERE UserEmail = '${email}'`, (err, results) => {
        
        if (err) throw err
        if (results !== undefined && results.length > 0) return res.status(403).json({ message: "email taken" })
    
        //store the users username, email and password in the database
        const hashed = bcrypt.hash(req.body.password, 10, (err, hash) => {

            if (err !== undefined) return res.status(400).json({ message: "could not hash password" })

            db.query(`INSERT INTO ${process.env.DB_NAME}.user VALUES ('${username}', '${email}', '${hash}')`, (err, result) => {

                if (err) return res.status(400).json({ message: "could not store hashed password in database" })

                //create an accessToken for the user
                const user = { email: email, username: username }

                const accessToken = createAccessToken(user)
                const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, {
                    expiresIn: '3d'
                })
                
                //store refreshToken
                db.query(`INSERT INTO ${process.env.DB_NAME}.token VALUES ('${email}', '${refreshToken}')`)

                //send the access token back to the user

                //httpOnly not available to js, we dont want regular cookies or localStorage!
                //1day 
                res.cookie('jwt', refreshToken, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000})
                res.setHeader('Access-Control-Allow-Origin', "https://638171cba04cfb2d43e70470--petmatcher.netlify.app")
                res.status(200).json({ user: user, accessToken: accessToken })

            })

        })

    })

})

router.post('/login', async (req, res) => {

    console.log(req.body);

    const email = req.body.email

    /* basic checks */
    if (email === undefined || req.body.password === undefined)
        return res.status(406).json({ message: "username, email, password are required fields" })

    db.query(`SELECT * FROM ${process.env.DB_NAME}.user WHERE UserEmail = '${email}'`, (err, results) => {
        if(err) throw err

        if(results.length === 0) return res.status(404).json( { message: "user not found" }) 
        else {

            //if we've located a user with this email
            db.query(`SELECT ??, ?? FROM ${process.env.DB_NAME}.user WHERE ?? = ?`, ['UserPassword', 'UserName', 'UserEmail', email],
            async (err, results) => {
                
                if(err) throw err
                
                const db_pw = results[0].UserPassword
                const username = results[0].UserName
        
                const comparison = await bcrypt.compare(req.body.password, db_pw)
        
                if(comparison === false) return res.status(403).json({ message: "incorrect password"})
                else {
        
                    const user = { email: email, username: username }
        
                    const accessToken = createAccessToken(user)
                    const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, {
                        expiresIn: '3d'
                    })
                    
                    //store refreshToken
                    db.query(`INSERT INTO ${process.env.DB_NAME}.token VALUES ('${email}', '${refreshToken}')`)
        
                    //send the access token back to the user
                    //httpOnly not available to js, we dont want regular cookies or localStorage!
                    //1day 
                    res.cookie('jwt', refreshToken, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000})
                    res.setHeader('Access-Control-Allow-Origin', `${process.env.CLIENT_NAME}`)
                    res.status(200).json({ user: user, accessToken: accessToken })
                
                }
        
            })
        }

    })  


})

router.delete('/logout', async (req, res) => {

    const email = req?.body?.email
    console.log(req.body);

    if(email === undefined) return res.status(406).json({ message: "email is required to log out"})
    
    //delete all refresh tokens from table for that specific user
    db.query(`DELETE FROM ${process.env.DB_NAME}.token WHERE TokenEmail = '${email}'`, (err, results) => {
        
        if(err) return res.status(500).json({ message: "could not delete refresh tokens from db"})
        else {
            res.setHeader('Access-Control-Allow-Origin', `${process.env.CLIENT_NAME}`)
            return res.status(200).json({ message: `succesfully signed ${email} out` })
        }
    })

})

router.get('/token', async (req, res) => {

    const cookies = req.cookies
    if(!cookies?.jwt) return res.status(401).json({ message: "no jwt cookie"})

    const token = cookies.jwt
    if(token === undefined) return res.status(406).json({ message: "need refreshToken"})
   
    //check db for token
    db.query(`
    
        select UserEmail, UserName, Token
        from ${process.env.DB_NAME}.token inner join ${process.env.DB_NAME}.user
        where (UserEmail = TokenEmail) and (Token = ?)

        `, [token], (err, results) => {

        if(err) return res.status(403).json({ message: "error finding token" })
        else {
            
            if(results.length === 0) return res.status(403).json({ message: "token does not exist" })
            else {
                
                //generate new accessToken
                const user = { email: results[0].UserEmail, username: results[0].UserName }
                const accessToken = createAccessToken(user) 
                res.setHeader('Access-Control-Allow-Origin', `${process.env.CLIENT_NAME}`)
                return res.status(200).json({ user: user, accessToken: accessToken })

            }

        }

    })

})

// router.get('/pool', authenticateToken, async (req, res) => {
//     console.log(req)
//     return res.json({message: "hello"})
// })

module.exports = router;
