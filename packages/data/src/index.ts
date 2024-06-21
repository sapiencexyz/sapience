import "reflect-metadata";
import { createConnection } from 'typeorm';
import { Event } from './entity/Event';
import express from 'express';

const app = express();
app.use(express.json());

createConnection({
    type: "sqlite",
    database: "./data/database.sqlite",
    synchronize: true,
    logging: false,
    entities: [Event],
}).then(async connection => {
    const eventRepository = connection.getRepository(Event);

    app.get('/events', async (req, res) => {
        const events = await eventRepository.find();
        res.json(events);
    });

    app.post('/events', async (req, res) => {
        const event = eventRepository.create(req.body);
        await eventRepository.save(event);
        res.json(event);
    });

    app.listen(3000, () => {
        console.log('Server is running on port 3000');
    });
}).catch(error => console.log(error));
