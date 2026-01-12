const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const port = 3000;

const app = express();
app.use(cors());
app.use(express.json());

const admin = require("firebase-admin");

// const serviceAccount = require("./firebase-admin-key.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    // console.log("decoded info ", decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.12vlvst.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const database = client.db("petService");
    const petServices = database.collection("services");
    const orderCollections = database.collection("orders");
    const userCollections = database.collection("users");

    // User Registration
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      userInfo.createdAt = new Date();
      userInfo.role = "user";
      userInfo.status = "active";

      const result = await userCollections.insertOne(userInfo);
      console.log(result);
      res.send(result);
    });

    // Get data to show in User Update
    app.get("/users/update", verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      console.log(email); // user@email.com

      const result = await userCollections.findOne({ email });
      res.status(200).send(result);
    });

    // GET user information based on email
    app.get(`/users/:email`, async (req, res) => {
      const { email } = req.params;
      console.log(email);

      const query = { email: email };
      const result = await userCollections.findOne(query);
      console.log(result);
      res.send(result);
    });

    // post or save service to DB
    app.post("/services", async (req, res) => {
      const data = req.body;
      const date = new Date();
      data.createdAt = date;
      data.itemStatus = "Not Sold";

      console.log(data);
      const result = await petServices.insertOne(data);
      res.send(result);
    });

    // GET all services
    app.get("/services", async (req, res) => {
      const { category, search } = req.query;
      const query = {};

      if (category && category !== "Pick an item") {
        query.category = category;
      }

      if (search) {
        query.name = { $regex: search, $options: "i" };
      }

      const result = await petServices.find(query).toArray();
      res.send(result);
    });

    // GET all services based on user email
    app.get("/services/:email", async (req, res) => {
      const { email } = req.params;

      const page = Number(req.query.page) || 0;
      const size = Number(req.query.size) || 10;
      const status = req.query.status;

      const query = { email: email };

      // Optional: Add status filter if your schema supports it
      if (status) {
        query.itemStatus = status;
      }

      const result = await petServices
        .find(query)
        .skip(page * size) // Fix: Apply pagination skip
        .limit(size) // Fix: Apply pagination limit
        .toArray();

      // console.log(result);
      res.send({ result: result });
    });

    // GET all services based on user params
    app.get("/my-items", async (req, res) => {
      const email = req.query.email;

      const page = Number(req.query.page);
      const size = Number(req.query.size);
      const status = req.query.status;

      console.log("Email", email);

      const query = { email: email };

      if (status) {
        query.status = status;
      }

      const result = await petServices
        .find(query)
        .limit(size)
        .skip(page * size)
        .toArray();

      console.log("/my-items", result);

      const totalRequest = await petServices.countDocuments(query);

      res.send({ result: result, totalRequest });
    });

    // GET one service based on service ID
    app.get("/services/details/:id", async (req, res) => {
      const { id } = req.params;
      console.log(id);

      const query = { _id: new ObjectId(id) };
      const result = await petServices.findOne(query);
      res.send(result);
    });

    // getting recent services data from DB while limiting
    app.get("/recent-services", async (req, res) => {
      const result = await petServices
        .find()
        .sort({ _id: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/auth/my-services", async (req, res) => {
      const { email } = req.query;

      const query = { email: email };
      const result = await petServices.find(query).toArray();
      res.send(result);
    });

    app.put("/update/:id", async (req, res) => {
      const data = req.body;
      const id = req.params;
      const query = { _id: new ObjectId(id) };

      const updateServices = {
        $set: data,
      };

      const result = await petServices.updateOne(query, updateServices);
      res.send(result);
    });

    app.delete(`/delete/:id`, async (req, res) => {
      const id = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await petServices.deleteOne(query);
      res.send(result);
    });

    // adding orders from DB
    app.post("/orders", async (req, res) => {
      const data = req.body;
      // console.log(data);
      const result = await orderCollections.insertOne(data);
      res.status(201).send(result);
    });

    app.get("/orders", async (req, res) => {
      const result = await orderCollections.find().toArray();
      res.status(200).send(result);
    });

    // GET recent requests specifically for the dashboard widget
    // Sorts by newest first, limits to 6 items, sends an Array directly
    app.get("/recent-requests/:email", async (req, res) => {
      const { email } = req.params;
      const query = { email: email };

      const result = await petServices
        .find(query)
        .sort({ _id: -1 }) // Sort by newest (descending)
        .limit(3) // Limit to 3 items for the widget
        .toArray();

      res.send(result); // Sends [ ... ] instead of { result: ... }
    });

    // GET specific user's items with pagination and filtering
    app.get("/users-items", async (req, res) => {
      const email = req.query.email;
      const page = parseInt(req.query.page) || 0;
      const size = parseInt(req.query.size) || 10;
      const status = req.query.status; // Frontend sends "available" or "sold"

      // 1. Filter by Email (Top-level field based on your image)
      const query = { email: email };

      // 2. Filter by Status
      // We need to match the frontend filter values to your DB values
      // DB uses "Not Sold", but frontend might use "available"
      if (status) {
        // If user selects "available" in filter, we look for "Not Sold" in DB
        // If user selects "sold", we look for "Sold"
        // You can adjust this mapping based on exactly what strings you save
        const statusArray = status.split(",").map((s) => {
          if (s === "available") return "Not Sold";
          if (s === "sold") return "Sold";
          return s;
        });

        query.itemStatus = { $in: statusArray };
      }

      console.log("Querying /users-items with:", query);

      const result = await petServices
        .find(query)
        .limit(size)
        .skip(page * size)
        .toArray();

      const totalRequest = await petServices.countDocuments(query);

      res.send({ result, totalRequest });
    });

    app.patch("/donation-request-status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      const query = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          itemStatus: status,
        },
      };

      const result = await petServices.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete("/requests/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await petServices.deleteOne(query);
      res.send(result);
    });

    // PUT: Update an existing item
    app.put("/update-item/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedItem = req.body;

      const item = {
        $set: {
          name: updatedItem.name,
          category: updatedItem.category,
          location: updatedItem.location,
          price: updatedItem.price,
          pickupDate: updatedItem.pickupDate,
          description: updatedItem.description,
          // We usually don't update email or _id
        },
      };

      const result = await petServices.updateOne(filter, item, options);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Developers");
});

app.listen(port, () => {
  console.log(`server is running on port: ${port}`);
});
