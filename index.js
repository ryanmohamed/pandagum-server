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

let roomConnections = {}
console.log(roomConnections)

setInterval(() => {
    io.to('pool').emit('pairup', "performing pair up...")
}, 1000)

const sendMsg = (id, msg) => {
    io.to(id).emit('msg', msg)
}

const sendErrorMsg = (id, type, msg) => {
    io.to(id).emit(`${type} error`, msg)
}

const sendSuccessMsg = (id, type, msg) => {
    io.to(id).emit(`${type} success`, msg)
}

const sendCustomEvent = (id, event) => {
    io.to(id).emit(event)
}


//in any room besides its own
const isInARoom = (id) => {

    const roomMap = io.of('/').adapter.rooms
    let flag = false
    //go through each room
    roomMap.forEach((val, key) => {
        //if a non socket room contains the id
        const currRoom = val
        if(currRoom?.has(id) && key !== id) {
            flag = true
            return
        }
    })
    return flag

}

//in specific room
const isInRoom = (id, roomId) => {

    const roomMap = io.of('/').adapter.rooms

    //check if room exists
    if(roomMap?.has(roomId) === true){
        //check room
        const room = roomMap?.get(roomId)
        if(room?.has(id)) return true 
        else return false
    }

    //room doesn't exist
    else return false;

}

const exitAllRooms = (socket) => {
 
    const { id, rooms } = socket
    rooms.forEach((val, key) => {
        if(key !== id){
            socket.leave(key)
            console.log(`Socket leaving room ${key}`)   
            if(key == 'pool') sendCustomEvent(id, 'left pool')
        }
    })
    sendCustomEvent(id, 'left rooms')

}

//should get called pretty often, since
//each socket automatically enters a room
//defined by their socket id!
io.of("/").adapter.on("create-room", (room) => {

    console.log(`\nRoom ${room} was created`);
    roomConnections[room] = 1 //must have 1 connection to be created

});

io.of("/").adapter.on("join-room", (room, id) => {
    console.log(`\nSocket ${id} has joined room ${room}`);
    roomConnections[room] += 1
});

io.of("/").adapter.on("leave-room", (room, id) => {
    console.log(`\nSocket ${id} has left room ${room}`);
    roomConnections[room] -= 1
});

io.of("/").adapter.on("delete-room", (room) => {
    console.log(`\nRoom ${room} was deleted`);
    delete roomConnections[room]
});

io.on('connection', (socket) => {

    console.log('\nNew connection')

    socket.on('create room', async (payload) => {

        const { roomId } = payload
        if(typeof roomId !== "string") roomId = roomId.toString()
        const { id } = socket

        console.log(`\nTrying to create room ${roomId}...`)

        if(roomId.match(/^\d{4}$/)){

            const roomMap = io.of('/').adapter.rooms
            const room = roomMap.get(roomId)

            // //if client is in the pool, remove them
            // if(isInRoom(id, 'pool')){
            //     sendMsg(id, `${id} leaving pool`)
            //     socket.leave('pool')
            // }

            //room already exists
            if(room !== undefined && room !== null){
                //socket is in room
                if (room.has(id)) {
                    sendMsg(id, 'you are already in room')
                    sendErrorMsg(id, 'create', `You are already in room ${roomId}.`)
                }
                //socket in room, but it exists
                else {
                    sendMsg(id, 'room already exists')
                    sendErrorMsg(id, 'create', `Room ${roomId} already exists! Try another.`)
                }
            }
    
            //room doesn't exist yet,
            else {  //create-room callback implicitly handles hashtable
                if(isInARoom(id)) {
                    exitAllRooms(socket)
                    sendErrorMsg(id, 'create', 'Leaving all rooms.')
                }
                socket.join(roomId)
                sendMsg(id, `created room ${roomId}`)
                sendSuccessMsg(id, 'create', `Room ${roomId} created and joined.`)
            }
        
        }

        else sendMsg(socket?.id, 'need 4 digit roomId')

    })

    socket.on('join room', (payload) => {

        const { roomId } = payload
        if(typeof roomId !== "string") roomId = roomId.toString()
        const id = socket?.id

        if(roomId.match(/^\d{4}$/)){
            const roomMap = io.of('/').adapter.rooms
            const room = roomMap.get(roomId)

            //room does not exist
            if(room === undefined || room === null){
                sendMsg(id, `Room ${roomId} does not exist yet`)
                sendErrorMsg(id, 'join', `Room ${roomId} not found`)
            }

            //client already in that specific room
            else if(room.has(id)){
                sendMsg(id, `${id} already in room ${roomId}`)
                sendErrorMsg(id, 'join', `You are already in Room ${roomId}`)
            }

            //room exists and client isn't in it
            else {

                //exit all other rooms
                if(isInARoom(id)) {
                    sendMsg(id, `${id} leaving all other rooms`)
                    sendSuccessMsg(id, 'join', 'Leaving other rooms')
                    exitAllRooms(socket)
                }

                const connections = room.size
                if(connections >= 2) {//full room
                    sendMsg(id, 'room full')
                    sendErrorMsg(id, 'join', `Room ${roomId} is full!`)
                } 
                else { //non full room
                    socket.join(roomId)
                    sendMsg(id, `joined room ${roomId}`)
                    sendSuccessMsg(id, 'join', `Joined room ${roomId}`)
                }

            }
        }

        else sendMsg(socket?.id, 'need 4 digit roomId')
        
    })

    socket.on('join pool', () => {

        const roomMap = io.of('/').adapter.rooms
        const { id } = socket
        
        if(isInARoom(id)){
            sendMsg(id, `${id} is already in a room`)
            sendMsg(id, `${id} is leaving room`)
            exitAllRooms(socket)
        }
        sendMsg(id, `${id} joining the pool`)
        sendCustomEvent(id, 'entered pool')
        socket.join('pool')

    })

    socket.on('exit pool', () => {
        const { id } = socket
        sendMsg(id, `${id} leaving the pool`)
        sendCustomEvent(id, 'left pool')
        socket.leave('pool')
    })

    socket.on('disconnect', () => {

        console.log('Disconnection')
        socket.connected = false

    })

})

io.on('disconnect', () => {
    console.log('Server disconnected!')
})