const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.f3tne.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

//verifyJwt token
const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message: 'UnAuthorized access'});
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECREST, function(err, decoded){
    if(err){
      res.status(403).send({message: 'forbiddenAccess'})
    }
    req.decoded = decoded;
    next();
  })
}

async function run(){
  try{
    await client.connect();
    const serviceCollection = client.db('doctors_portal').collection('services');
    const bookingCollection = client.db('doctors_portal').collection('bookings');
    const userCollection = client.db('doctors_portal').collection('users');
    const doctorCollection = client.db('doctors_portal').collection('doctors');

    //Verify Admin
    const verifyAdmin = async(req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email: requester});
      if(requesterAccount.role === "admin"){
        next();
      }
      else{
        res.status(403).send({message: 'forbiddenAccess'})
      }
    }

    //add a new Admin
    app.put('/user/admin/:email', verifyJwt, async(req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email: requester});
      if(requesterAccount.role === "admin"){
        const filter = {email: email};
        const updateDoc = {
          $set: {role: 'admin'},
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
      else{
        res.status(403).send({message: 'forbiddenAccess'})
      }
    })

    //add a new user
    app.put('/user/:email', async(req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = {email: email};
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECREST, {expiresIn: '1h'});
      res.send({result, token});
    })

    //check admin label
    app.get('/admin/:email', async(req, res) =>{
      const email = req.params.email;
      const user = await userCollection.findOne({email: email});
      const isAdmin = user.role === 'admin';
      res.send({admin: isAdmin})
    })
    
    //get all services 
    app.get('/services', async(req, res) => {
      const query = {}
      const cursor = serviceCollection.find(query).project({name: 1});
      const services = await cursor.toArray();
      res.send(services);
    });

    //get all users
    app.get('/user', verifyJwt, async(req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })

    //get available slots
    app.get('/available', async(req, res) => {
      const date = req.query.date;
      
      // step 1:  get all services
      const services = await serviceCollection.find().toArray();

      // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
      const query = {date: date};
      const bookings = await bookingCollection.find(query).toArray();

      // step 3: for each service
      services.forEach(service=>{
      // step 4: find bookings for that service. output: [{}, {}, {}, {}]
      const serviceBookings = bookings.filter(book => book.treatment === service.name);
      // step 5: select slots for the service Bookings: ['', '', '', '']
      const bookedSlots = serviceBookings.map(book => book.slot);
      // step 6: select those slots that are not in bookedSlots
      const available = service.slots.filter(slot => !bookedSlots.includes(slot));
      //step 7: set available to slots to make it easier 
      service.slots = available;
      })
      res.send(services)
    })

    //add a new booking
    app.post('/booking', async(req, res) => {
      const booking = req.body;
      const query = {treatmentName: booking.treatmentName, data: booking.data, patientName: booking.patientName};
      const exists = await bookingCollection.findOne(query);
      if(exists){
        return res.send({success: false, booking: exists})
      }
      const result = await bookingCollection.insertOne(booking);
      return res.send({success: true, result});
    })

    //booking find on email
    app.get('/booking', verifyJwt, async(req, res) => {
      const patientEmail = req.query.patientEmail;
      const decondedEmail = req.decoded.email;
      if(patientEmail === decondedEmail){
        const query = {patientEmail: patientEmail};
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      }else{
        return res.status(403).send({message: 'forbiddenAccess'})
      }
    })

    //payment bookings
    app.get('/bookings/:id', verifyJwt, async(req, res) => {
      const id = req.params.id;
      const query = {_id: ObjectId(id)}
      const bookings = await bookingCollection.findOne(query);
      res.send(bookings);
    })

    //add new doctor form database
    app.post('/doctor', verifyJwt, verifyAdmin, async(req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    })

    //get all doctors form Database
    app.get('/doctor', verifyJwt, async(req, res) => {
      const doctor = await doctorCollection.find().toArray();
      res.send(doctor);
    })

    //Delete Doctor
    app.delete('/doctor/:email', verifyJwt, verifyAdmin, async(req, res) => {
      const email = req.params.email;
      const query = {email: email};
      const result = doctorCollection.deleteOne(query);
      res.send(result);
    })
  }
  finally{}
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello From Doctors Portal');
})

app.listen(port, () => {
  console.log(`Doctors Portal listening on Port: ${port}`);
})