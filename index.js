require('dotenv').config()

const express = require('express')
const app = express()

const cors = require('cors')
const jwt = require('jsonwebtoken')

app.use(express.json())
app.use(cors({
    credentials: true,
    origin: 'http://localhost:3000' //client side
}))

//establish middleware
const authenticateToken = require('./middleware/authenticateToken')

//frontend will pass 
app.get('/pool', authenticateToken, async (req, res) => {



})

const PORT = 4000
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}...\n`)
})


