const questions = [
    {
      question: 'How much wood would a woodchuck chuck, if a woodchuck could chuck wood?',
      type: 'mc',
      choices: ['one', 'two', 'three']
    },
    {
      question: 'How much wood would a woodchuck chuck, if a woodchuck could chuck wood?',
      type: 'mc',
      choices: ['idk', 'you tell me', 'idc', 'potato', 'forge the sword']
    },
    {
      question: 'How much wood would a woodchuck chuck, if a woodchuck could chuck wood?',
      type: 'short'
    }
]

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
    allowCredentials: true,
    origin: 'https://638152503f0ba615b71921c0--petmatcher.netlify.app'
}))

//establish middleware
const authenticateToken = require('./middleware/authenticateToken')

//frontend will pass token appropriately
app.get('/pool', authenticateToken, async (req, res) => {

    //simply used as an authetication layer before accessing socket

    const email = req.user?.email
    const username = req.user?.username
    const ip = req.headers['x-real-ip'] || req.connection.remoteAddress;
    res.setHeader('Access-Control-Allow-Origin', 'https://638152503f0ba615b71921c0--petmatcher.netlify.app')
    return res.status(200).json({ username: username })

})

const PORT = process.env.PORT || 4000
server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}...\n`)
})

const io = socketio(server, {
    cors: {
        origins: ['https://638152503f0ba615b71921c0--petmatcher.netlify.app'],
        credentials: true
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

//dictionary where each key (room id) return RoomInfo
// - user1 
// - user2
// - ready
// - questions_left
// - question 

let roomInfo = {}

setInterval(() => {
    io.in('pool').emit('pairup', "performing pair up...")
}, 1000)

const sendMsg = (id, msg) => {
    io.in(id).emit('msg', msg)
}

const sendErrorMsg = (id, type, msg) => {
    io.in(id).emit(`${type} error`, msg)
}

const sendSuccessMsg = (id, type, msg) => {
    io.in(id).emit(`${type} success`, msg)
}

const sendCustomEvent = (id, event) => {
    io.in(id).emit(event)
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
            // else {
            //     //we don't ned to do this for the pool 
            //     //because we don't track usernames 
            //     if(roomInfo[key].includes(id)){
            //         const i = roomInfo[key].indox(id)
            //         roomInfo[key].splice(i, 1)
            //         console.log(roomInfo[key]);
            //     }
            // }
        }
    })
    sendCustomEvent(id, 'left rooms')

}

const getCurrentRoom = (socket) => {

    const { id, rooms } = socket
    let room = null

    if(!isInARoom(id)) return null
    else {

        const res = rooms.forEach((val, key) => {
            if(key !== id) {
                room = key
            }
        })

        return room

    }

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

    //if the first user left    
    if(roomInfo[room]?.user1.id === id){
        //make the second user the first user
        roomInfo[room].user1 = roomInfo[room].user2
        roomInfo[room].user2 = undefined
        roomInfo[room].ready = false 
        roomInfo[room].question_left = 3 //reset questions
        roomInfo[room].question = undefined //no question if not enough players
        io.in(room).emit('room update', roomInfo[room])
    }

    //if the second user left
    //make the second user the first user
    else if(roomInfo[room]?.user2.id === id){
        roomInfo[room].user2 = undefined
        roomInfo[room].ready = false 
        roomInfo[room].question_left = 3 //reset questions
        roomInfo[room].question = undefined //no question if not enough players
        return io.in(room).emit('room update', roomInfo[room])
    }

});

io.of("/").adapter.on("delete-room", (room) => {
    console.log(`\nRoom ${room} was deleted`);
    delete roomConnections[room]
});

io.on('connection', async (socket) => {

    console.log('\nNew connection')

    socket.on('create room', (payload) => {

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

                //since the the room has just been created, we only set it to a list len 1
                const username = socket?.handshake?.auth?.username

                //set dictionary key value to object
                roomInfo[roomId] = { 
                    ready: false,
                    user1: {
                        username: username,
                        id: socket?.id,
                        locked: false,
                        answers: []
                    },
                    user2: undefined,
                    question_left: 3,
                    question: undefined
                }

                console.log(roomInfo[roomId])

                sendMsg(id, `created room ${roomId}`)
                sendSuccessMsg(id, 'create', `Room ${roomId} created and joined.`)
                
                // io.in sends from the server to ALL clients in the room
                // socket.io however refers to this specific socket BROADCASTING to all other clients
                io.in(roomId).emit('room update', roomInfo[roomId])

            }
        
        }

        else sendMsg(socket?.id, 'need 4 digit roomId')

    })

    socket.on('join room', async (payload) => {

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
                    await socket.join(roomId)

                    const username = socket?.handshake?.auth?.username
                    roomInfo[roomId].user2 = {
                        username: username,
                        id: socket?.id,
                        locked: false,
                        answers: []
                    }
                    roomInfo[roomId].ready = true
                    roomInfo[roomId].question_left = 3
                    roomInfo[roomId].question = questions[0] 
                    console.log(roomInfo[roomId])

                    sendMsg(id, `joined room ${roomId}`)
                    sendSuccessMsg(id, 'join', `Joined room ${roomId}`)

                    // io.in sends from the server to ALL clients in the room
                    // socket.io however refers to this specific socket BROADCASTING to all other clients
                    io.in(roomId).emit('room update', roomInfo[roomId]) //the emit is working, its just emitting to the client before they even navigate to where we assign the listener, rethink room context, socket context etc 
                    
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

    socket.on('get room id', () => {
        const { id } = socket
        const roomId = getCurrentRoom(socket)
        io.in(id).emit('room id', roomId)
    })

    socket.on('message', values => {
        const { roomId, message } = values
        console.log(roomId)
        console.log(message);

        //broadcast message to all OTHER sockets in the room
        socket.to(roomId).emit('chat-msg', message)
    })

    /* QUESTIONS */
    socket.on('answer question', async (values) => {
        
        const roomId = getCurrentRoom(socket)
        const { user1, user2 } = roomInfo[roomId]

        if(socket.id == user1.id){
            roomInfo[roomId].user1.answers.push(values)
            roomInfo[roomId].user1.locked = true
            await io.in(roomId).emit('room update', roomInfo[roomId])
        }

        else if(socket.id == user2.id){
            roomInfo[roomId].user2.answers.push(values)
            roomInfo[roomId].user2.locked = true
            await io.in(roomId).emit('room update', roomInfo[roomId])
        }
        

        if(user1.locked == true && user2.locked == true){
            roomInfo[roomId].user1.locked = false
            roomInfo[roomId].user2.locked = false
            roomInfo[roomId].question_left -= 1
            roomInfo[roomId].question = questions[3 - roomInfo[roomId].question_left]
            await io.in(roomId).emit("room update", roomInfo[roomId])
        }
    })

    socket.on('disconnect', () => {

        console.log('Disconnection')
        socket.connected = false

    })

})

io.on('disconnect', () => {
    console.log('Server disconnected!')
})