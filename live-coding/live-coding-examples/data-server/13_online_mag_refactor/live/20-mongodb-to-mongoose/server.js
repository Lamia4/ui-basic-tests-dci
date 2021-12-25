import dotenv from "dotenv";
import express from "express";
import mongodb from "mongodb";
import db from "./database/connection.local.mongoclient.js";
import mongooseCon from "./database/connection.local.mongoose.js";
mongooseCon; // um das Löschen des imports durch "autosave" zu verhindern
import Article from "./models/Article.js";
import mongoose from "mongoose";

dotenv.config(); // alternativ Zieldatei als Parameter angeben. Default: ".env"

const server = express();

const { ObjectId } = mongodb;

server.listen(process.env.PORT, () => console.log(`server is listening on port ${process.env.PORT}`));

server.use(express.json());
server.use(express.urlencoded({ extended: true }));


server.get("/articles", async (req, res) => {
    Article.find(
        {}, 
        (err, docs) => {
            if (err) {
                console.error("error in Article.find():", err);
                return res.status(500);
            }
            res.status(200).json(docs);
        }
    );
});

server.get("/articles/:articleId", async (req, res) => {
    Article.findById(
        req.params.articleId, 
        (err, docs) => {
            if (err) return;
            //if (err) { // commented out => error handling done in .catch(...) below.
            //    console.error("error in Article.findById():", err);
            //    return res.status(500);
            //}
            res.status(200).json(docs);
        }
    ).catch(e => {
        if (e instanceof mongoose.CastError) { // Test auf CastError, um sicher zu gehen, dass e.reason.message verfügbar ist.
            console.error('"error - in request:"', req.url, e.reason.message, "potential invalid ObjectId");
            return res.status(422).send("error 422 - Unprocessable Entity<br>" + e.reason.message); // 422 - Unprocessable Entity
        }

        console.error('"error during processing request:"', req.url, e);
        return res.status(500).send("error 500 - Unprocessable Entity"); // 500 - Server Error
    });
});


// Wir wählen mit der Funktion .collection() eine Collection aus, auf die wir zugreifen wollen
// Anschließend rufen wir hier .find() ohne weitere Parameter auf, um sämtliche Datensätze ausgelesen zu bekommen
// Wenn wir die E-Mail-Adresse NICHT ausgegeben bekommen wollen, können wir das mittels .project({ <key>: true/false }) erreichen
// Ist dort ein Key auf false gesetzt, wird er nicht ausgegeben
server.get("/users", async (req, res) => {
    const users = await db.collection("users").find().project({ email: false }).toArray();
    res.json(users);
});

// Bei der Suche nach einem User können wir statt .find() die Funktion .findOne() nutzen
// Dort übergeben wir allerdings eine Suchbedingung, in unserem Falle die _id, die wir aus den Params entnehmen und mit der ObjectId in eine ID für MongoDB umwandeln
server.get("/users/:userId", async (req, res) => {
    const user = await db.collection("users").findOne({ _id: ObjectId(req.params.userId) });
    res.json(user);
});


// Wollen wir mehere Dokumente über Referenzen zusammenführen, benötigen wir die Funktion aggregate
// Diese erwartet ein Array ("pipeline") als Parameter, in dem eine oder mehrere Operationen als Objekte aufgeführt werden
// Hier suchen wir zuerst ein bestimmtes Dokument anhand der _id mit dem Operator $match heraus
// Anschließend kombinieren/aggregieren wir mit $lookup dieses Dokument mit den referenzierten Artikeln in der readinglist
// Beim $lookup sind folgende vier Properties wichtig:
// - from: Die zu verknüpfende Collection
// - localField: Das Feld des Ausgangsdokuments, in dem die Referenzen stehen (hier readinglist aus der Collection user)
// - foreignField: Das Feld in der "from" Collection, auf den die Referenz zeigt
// - as: Ein Name, unter dem die Referenzen im Ergebnis aufgelistet werden
server.get("/users/:userId/readinglist", async (req, res) => {
    const articles = await db.collection("users").aggregate([
        {
            $match: {
                _id: ObjectId(req.params.userId),
            },
        },
        {
            $lookup: {
                from: "articles",
                localField: "readinglist",
                foreignField: "_id",
                as: "articles",
            }
        },
    ]).toArray();
    res.json(articles);
});


// Neue Dokumente können wir über .insertOne hinzufügen
// Hier wird das gesamte Dokument übergeben
// MongoDB erstellt automatisch eine _id, die hier im result zu finden ist
server.post("/users", async (req, res) => {
    console.log("received request with body:", req.body);
    const result = await db.collection("users").insertOne({
        name: req.body.name,
        email: req.body.email,
    });
    res.json(result);
});


// Zum Aktualisieren eines Dokuments verwenden wir .updateOne()
// Der erste Parameter ist analog zu .findOne() oder .find()
// Im zweiten Paramter können wir über den Operator $set die Daten aktualisieren, die wir aktualisieren wollen
server.put("/users/:userId", async (req, res) => {
    console.log("received request with body:", req.body);
    const result = await db.collection("users").updateOne({
        _id: ObjectId(req.params.userId),
    },
    {
        $set: {
            name: req.body.name,
            readinglist: req.body.readinglist,
        },
    });
    res.json(result);
});

// Löschen funktioniert wie .findOne(), nur dass das Dokument natürlich gelöscht wird :-)
server.delete("/users/:userId", async (req, res) => {
    const result = await db.collection("users").deleteOne({
        _id: ObjectId(req.params.userId),
    });
    res.json(result);
});
