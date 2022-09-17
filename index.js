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

let pool = new Array(0)
let users = new Array(0)

io.on('connection', (socket) => {

    socket.on('name', (name) => {
        const id = socket.id
        const user = {
            username: name,
            id: id
        }
        console.log(`Adding new client: ${socket.id} to pool...\n`)
        pool.push(user)
        console.table(pool)

        users.push(name)
        io.emit('pool', users)
    })

    socket.on('disconnect', () => {

        const user = pool.filter(ele => {
            return ele.id === socket.id
        })[0]

        console.log(`Removing client: ${socket.id} from pool...\n`)
        if(pool.includes(user)){
            const index = pool.indexOf(user)
            pool.splice(index, 1)
        }

        users = users.filter(ele => {
            return ele !== user.username
        }) 

        console.log(users)
        console.table(pool)
        io.emit('pool', users)

        socket.connected = false

    })

})

io.on('disconnect', () => {
    console.log('Server disconnected!')
})




