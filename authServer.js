require('dotenv').config()

const express = require('express')
const app = express()
const PORT = process.env.PORT || 4001

const cors = require('cors')
const mysql = require('mysql')

app.use(express.json())
app.use(cors({
    credentials: true,
    allowCredentials: true,
    origin: process.env.CLIENT_NAME
}))

//establish routers - middleware
const authRouter = require('./routes/auth')
app.use('/auth', authRouter);

app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}...\n`)
})
