import "reflect-metadata";
import { createConnection } from 'typeorm';
import cors from 'cors';
import { Price } from './entity/Price';
import express from 'express';
import { Between } from 'typeorm';

const app = express();
app.use(express.json());
app.use(cors());

createConnection({
    type: "sqlite",
    database: "./data/database.sqlite",
    synchronize: true,
    logging: true,
    entities: [Price],
}).then(async connection => {
    const priceRepository = connection.getRepository(Price);

    // Get all price data points between specified timestamps and filtered by contractId
    app.get('/prices', async (req, res) => {
        const { startTimestamp, endTimestamp, contractId } = req.query;
        const where: any = {};

        if (startTimestamp && endTimestamp) {
            where.timestamp = Between(Number(startTimestamp), Number(endTimestamp));
        }
        if (contractId) {
            where.contractId = contractId;
        }

        const prices = await priceRepository.find({ where });
        res.json(prices);
    });

    // Get average price over a specified time period filtered by contractId
    app.get('/prices/average', async (req, res) => {
        const { startTimestamp, endTimestamp, contractId } = req.query;
        const where: any = {};

        if (startTimestamp && endTimestamp) {
            where.timestamp = Between(Number(startTimestamp), Number(endTimestamp));
        }
        if (contractId) {
            where.contractId = contractId;
        }

        const prices = await priceRepository.find({ where });
        
        if (prices.length === 0) {
            return res.status(404).json({ error: 'No data found for the specified range and contractId' });
        }

        const average = prices.reduce((acc, price) => acc + price.value, 0) / prices.length;
        res.json({ average });
    });

    // Get data for rendering candlestick/boxplot charts filtered by contractId
    app.get('/prices/chart-data', async (req, res) => {
        const { startTimestamp, endTimestamp, contractId } = req.query;
        const where: any = {};

        if (startTimestamp && endTimestamp) {
            where.timestamp = Between(Number(startTimestamp), Number(endTimestamp));
        }
        if (contractId) {
            where.contractId = contractId;
        }

        const prices = await priceRepository.find({
            where,
            order: {
                timestamp: 'ASC'
            }
        });

        if (prices.length === 0) {
            return res.status(404).json({ error: 'No data found for the specified range and contractId' });
        }

        const chartData = prices.map(price => ({
            timestamp: price.timestamp,
            value: price.value
        }));

        res.json(chartData);
    });

    app.listen(3000, () => {
        console.log('Server is running on port 3000');
    });
}).catch(error => console.log(error));
