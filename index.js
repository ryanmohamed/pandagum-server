require('dotenv').config()

const http = require('http')
const express = require('express')
const socketio = require('socket.io')

const app = express()
const server = http.createServer(app)

const cors = require('cors')
const jwt = require('jsonwebtoken')

app.use(express.json())
app.use(cors({
    credentials: true,
    origin: 'http://localhost:3000' //client side
}))

//establish middleware
const authenticateToken = require('./middleware/authenticateToken')

//frontend will pass token appropriately
app.get('/pool', authenticateToken, async (req, res) => {

    //simply used as an authetication layer before accessing socket

    const email = req.user?.email
    const username = req.user?.username
    const ip = req.headers['x-real-ip'] || req.connection.remoteAddress;

    return res.status(200).json({ username: username })

})

const PORT = 4000
server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}...\n`)
})

const io = socketio(server, {
    cors: {
        origin: 'http://localhost:3000'
    }
})

io.use((socket, next) => {

    const { accessToken } = socket.handshake?.auth
    if(accessToken === null || accessToken === undefined) return next(new Error('Invalid Token')) 

    //verify token using jwt
    jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, (err, user) => {

        if(err) {
            console.log(`\n${user?.email} has NOT been verified.\nMay NOT connect...`)
            return next(new Error('Invalid Token'))
        }
        else {
            console.log(`\n${user?.email} has been verified.\nMay now connect...`)
            return next()
        }

    })

})

setInterval(() => {
    io.to('pool').emit('pairup', "performing pair up...")
}, 1000)

io.on('connection', (socket) => {

    console.log('New connection')

    socket.on('join pool', () => {
        socket.join('pool') //join pool of players
        io.to('pool').emit('msg', 'hi guys new dude here')
    })

    socket.on('exit pool', () => {
        socket.leave('pool')
        io.to('pool').emit('msg', 'some dude left')
    })


    socket.on('disconnect', () => {

        console.log('Disconnection')
        socket.connected = false

    })

})

io.on('disconnect', () => {
    console.log('Server disconnected!')
})