require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || "");

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    {
        auth: {
            persistSession: false
        }
    }
);

function getMissingConfig() {
    const required = [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_PECHE"
    ];

    return required.filter((key) => {
        return (
            !process.env[key] ||
            process.env[key].includes("TA_CLE") ||
            process.env[key].includes("xxxxxxxx")
        );
    });
}

const products = {
    peche: {
        name: "Pack Pêche OX",
        priceId: process.env.STRIPE_PRICE_PECHE,
        downloadUrl: process.env.DOWNLOAD_PECHE
    },

    jobs: {
        name: "Système de jobs",
        priceId: process.env.STRIPE_PRICE_JOBS,
        downloadUrl: process.env.DOWNLOAD_JOBS
    },

    zombie: {
        name: "Zombie Event",
        priceId: process.env.STRIPE_PRICE_ZOMBIE,
        downloadUrl: process.env.DOWNLOAD_ZOMBIE
    }
};

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// Webhook Stripe : raw body obligatoire AVANT express.json()
app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error("Webhook signature invalide:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const userId = session.client_reference_id;
        const productId = session.metadata?.product_id;
        const product = products[productId];

        if (!userId || !productId || !product) {
            console.error("Webhook incomplet:", { userId, productId });
            return res.json({ received: true });
        }

        const { error } = await supabaseAdmin.from("purchases").upsert(
            {
                user_id: userId,
                product_id: productId,
                product_name: product.name,
                stripe_session_id: session.id,
                stripe_payment_intent: session.payment_intent || null,
                amount_total: session.amount_total || null,
                currency: session.currency || "eur",
                status: "paid",
                download_url: product.downloadUrl
            },
            {
                onConflict: "stripe_session_id"
            }
        );

        if (error) {
            console.error("Erreur sauvegarde achat:", error.message);
            return res.status(500).json({
                error: "Erreur sauvegarde achat"
            });
        }

        console.log(`Achat ajouté au compte ${userId}: ${product.name}`);
    }

    res.json({ received: true });
});

app.use(express.json());

async function getUserFromRequest(req) {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "");

    if (!token) return null;

    const supabaseUser = createClient(
        process.env.SUPABASE_URL || "",
        process.env.SUPABASE_ANON_KEY || "",
        {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        }
    );

    const { data, error } = await supabaseUser.auth.getUser(token);

    if (error || !data?.user) return null;

    return data.user;
}

async function hasAlreadyBought(userId, productId) {
    const { data, error } = await supabaseAdmin
        .from("purchases")
        .select("id")
        .eq("user_id", userId)
        .eq("product_id", productId)
        .limit(1);

    if (error) {
        console.error("Erreur vérification achat :", error.message);
        return false;
    }

    return data && data.length > 0;
}

app.get("/api/config", (req, res) => {
    const required = [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY"
    ];

    const missing = required.filter((key) => {
        return !process.env[key] || process.env[key].includes("TA_CLE") || process.env[key].includes("xxxxxxxx");
    });

    if (missing.length) {
        return res.status(500).json({
            error: `Configuration Supabase incomplète : ${missing.join(", ")}`
        });
    }

    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY
    });
});

app.get("/api/health", (req, res) => {
    const missing = getMissingConfig();

    res.json({
        ok: missing.length === 0,
        missing
    });
});

app.get("/api/me", async (req, res) => {
    const user = await getUserFromRequest(req);

    if (!user) {
        return res.status(401).json({
            user: null,
            profile: null,
            error: "Non connecté."
        });
    }

    let { data: profile, error } = await supabaseAdmin
        .from("profiles")
        .select("id, email, username, avatar_url, created_at")
        .eq("id", user.id)
        .single();

    if (error || !profile) {
        const insert = await supabaseAdmin
            .from("profiles")
            .insert({
                id: user.id,
                email: user.email,
                username: ""
            })
            .select("id, email, username, avatar_url, created_at")
            .single();

        profile = insert.data;
    }

    res.json({
        user: {
            id: user.id,
            email: user.email
        },
        profile
    });
});

app.post("/api/profile", async (req, res) => {
    const user = await getUserFromRequest(req);

    if (!user) {
        return res.status(401).json({
            success: false,
            error: "Non connecté."
        });
    }

    const username = String(req.body.username || "").trim().slice(0, 32);

    const { error } = await supabaseAdmin.from("profiles").upsert({
        id: user.id,
        email: user.email,
        username
    });

    if (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }

    res.json({
        success: true,
        username
    });
});

app.post("/api/create-checkout-session", async (req, res) => {
    try {
        const user = await getUserFromRequest(req);

        if (!user) {
            return res.status(401).json({
                error: "Connecte-toi avant d'acheter."
            });
        }

        const { productId } = req.body;
        const product = products[productId];

        if (!product || !product.priceId) {
            return res.status(400).json({
                error: "Produit non configuré côté serveur."
            });
        }

        const alreadyBought = await hasAlreadyBought(user.id, productId);

        if (alreadyBought) {
            return res.status(409).json({
                error: "Tu possèdes déjà ce produit."
            });
        }

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [
                {
                    price: product.priceId,
                    quantity: 1
                }
            ],
            client_reference_id: user.id,
            customer_email: user.email,
            metadata: {
                user_id: user.id,
                product_id: productId
            },
            success_url: `${process.env.SITE_URL}/index.html?success=1`,
            cancel_url: `${process.env.SITE_URL}/index.html?cancel=1`
        });

        res.json({
            url: session.url
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: "Impossible de créer le paiement."
        });
    }
});

app.get("/api/my-purchases", async (req, res) => {
    const user = await getUserFromRequest(req);

    if (!user) {
        return res.status(401).json({
            error: "Non connecté."
        });
    }

    const { data, error } = await supabaseAdmin
        .from("purchases")
        .select("id, product_id, product_name, amount_total, currency, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        return res.status(500).json({
            error: error.message
        });
    }

    res.json({
        purchases: data || []
    });
});

app.get("/api/purchases", async (req, res) => {
    const user = await getUserFromRequest(req);

    if (!user) {
        return res.status(401).json({
            error: "Non connecté."
        });
    }

    const { data, error } = await supabaseAdmin
        .from("purchases")
        .select("id, product_id, product_name, amount_total, currency, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        return res.status(500).json({
            error: error.message
        });
    }

    res.json({
        purchases: data || []
    });
});

app.get("/api/download/:purchaseId", async (req, res) => {
    const user = await getUserFromRequest(req);

    if (!user) {
        return res.status(401).json({
            error: "Non connecté."
        });
    }

    const { data, error } = await supabaseAdmin
        .from("purchases")
        .select("download_url")
        .eq("id", req.params.purchaseId)
        .eq("user_id", user.id)
        .single();

    if (error || !data?.download_url) {
        return res.status(404).json({
            error: "Achat introuvable."
        });
    }

    res.json({
        url: data.download_url
    });
});

app.post("/api/test-free-purchase", async (req, res) => {
    try {
        const user = await getUserFromRequest(req);

        if (!user) {
            return res.status(401).json({
                error: "Non connecté."
            });
        }

        const { productId } = req.body;

        if (productId !== "jobs") {
            return res.status(400).json({
                error: "Produit gratuit invalide."
            });
        }

        const alreadyBought = await hasAlreadyBought(user.id, productId);

        if (alreadyBought) {
            return res.status(409).json({
                error: "Tu possèdes déjà ce produit."
            });
        }

        const { error } = await supabaseAdmin.from("purchases").upsert(
            {
                user_id: user.id,
                product_id: "jobs",
                product_name: "Système de jobs",
                stripe_session_id: "free_jobs_" + user.id,
                stripe_payment_intent: null,
                amount_total: 0,
                currency: "eur",
                status: "free",
                download_url: process.env.DOWNLOAD_JOBS || "https://google.com"
            },
            {
                onConflict: "stripe_session_id"
            }
        );

        if (error) {
            return res.status(500).json({
                error: error.message
            });
        }

        res.json({
            success: true
        });
    } catch (err) {
        console.error("Erreur produit gratuit :", err);

        res.status(500).json({
            error: "Erreur serveur pendant l'ajout du produit gratuit."
        });
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 4242;

app.listen(port, () => {
    const missing = getMissingConfig();

    console.log(`Olyx Studio lancé sur http://localhost:${port}`);

    if (missing.length) {
        console.log("Variables .env manquantes :", missing.join(", "));
    } else {
        console.log("Configuration .env OK");
    }
});

