const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Zoho SMTP transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER || 'james@stricklandtechnology.net',
        pass: process.env.SMTP_PASS || 'rPpXS6FM0hqd'
    }
});

// POST /checkout — capture lead + redirect to Stripe
app.post('/checkout', async (req, res) => {
    const { name, phone, email, business } = req.body;

    // Send lead notification email to James
    try {
        await transporter.sendMail({
            from: '"Strickland Technology" <james@stricklandtechnology.net>',
            to: 'james@stricklandtechnology.net',
            subject: `New Lead — ${business || 'Power Truck Parts'} — ptparts pitch`,
            html: `
                <h2>New Website Lead</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Business:</strong> ${business}</p>
                <p><strong>Source:</strong> ptparts.fly.dev pitch page</p>
                <hr>
                <p>They are proceeding to Stripe checkout for $97/month.</p>
            `
        });
    } catch (err) {
        console.error('Email error:', err.message);
    }

    // Create Stripe Checkout session
    const priceId = process.env.STRIPE_PRICE_ID;

    if (!priceId || priceId === 'price_placeholder') {
        // Stripe not configured yet — redirect to success with note
        return res.redirect(`/success?name=${encodeURIComponent(name)}&demo=1`);
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [{
                price: priceId,
                quantity: 1
            }],
            customer_email: email,
            metadata: {
                name,
                phone,
                business: business || 'Power Truck Parts LLC'
            },
            success_url: `${process.env.BASE_URL || 'https://ptparts.fly.dev'}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.BASE_URL || 'https://ptparts.fly.dev'}/#signup`
        });

        res.redirect(303, session.url);
    } catch (err) {
        console.error('Stripe error:', err.message);
        res.status(500).send('Payment setup error. Please call (832) 818-5810.');
    }
});

// Stripe webhook — handle successful payments
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        event = webhookSecret
            ? stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
            : JSON.parse(req.body);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { name, phone, business } = session.metadata || {};

        transporter.sendMail({
            from: '"Strickland Technology" <james@stricklandtechnology.net>',
            to: 'james@stricklandtechnology.net',
            subject: `PAID — ${business || 'Power Truck Parts'} — $97/month subscription started!`,
            html: `
                <h2>Payment Confirmed!</h2>
                <p><strong>Customer:</strong> ${name}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Email:</strong> ${session.customer_email}</p>
                <p><strong>Business:</strong> ${business}</p>
                <p><strong>Amount:</strong> $97/month subscription</p>
                <p><strong>Stripe Session:</strong> ${session.id}</p>
                <hr>
                <p>Time to connect their domain and go live!</p>
            `
        }).catch(console.error);
    }

    res.json({ received: true });
});

app.get('/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`ptparts pitch server running on port ${PORT}`);
});
