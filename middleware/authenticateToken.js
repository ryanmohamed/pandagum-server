require('dotenv').config()
const jwt = require('jsonwebtoken')

//establish middleware
const authenticateToken = (req, res, next) => {

    //authorization items like Bearer or Content Type is found in the the request header, not the body
    const authorization = req.headers['authorization']
    if(!authorization) return res.status(401).json({ message: "no authorization"})
    
    const token = authorization && authorization.split(' ')[1] //make sure we have one, then take the 2nd result from a split based on spaces
    if(token === null || token === undefined) return res.status(403).json({ message: "expected [Bearer _token_ ]" })

    //verify token using jwt
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {

        if(err) return res.status(403).json({ message: "token not valid"})
        else {
            req.user = user //send the user info along with the request to the next route
            next()
        }

    })

}



module.exports = authenticateToken

