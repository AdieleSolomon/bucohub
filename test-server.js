    import express, { json } from 'express';
    const app = express();
    const PORT = 5502;

    app.use(json());

    app.get('/', (req, res) => {
    res.json({ message: 'Test server is working!' });
    });

    app.listen(PORT, () => {
    console.log(`✅ Test server running on http://localhost:${PORT}`);
    }); 