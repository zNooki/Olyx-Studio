let supabaseClient = null;
let currentUser = null;

const notificationSound = new Audio("/sounds/notification.mp3");
notificationSound.volume = 0.4;

const API_BASE = (() => {
    const isFile = window.location.protocol === "file:";
    const isLiveServer = ["5500", "5501", "5502"].includes(window.location.port);

    if (isFile || isLiveServer) {
        return "http://localhost:4242";
    }

    return "";
})();

async function apiFetch(path, options = {}) {
    return fetch(`${API_BASE}${path}`, options);
}

const products = {
    peche: {
        image: "images/peche.png",
        tag: "FiveM • OX",
        title: "Pack Pêche OX",
        price: "9,99 €",
        available: true,
        desc: `🎣 Pack Pêche OX

✔ Compatible OX
✔ Niveaux de pêche
✔ Zones configurables
✔ Loots personnalisables
✔ Interface moderne
✔ Notifications modernes
✔ Compatible ox_lib, ox_inventory et ox_target
✔ Support inclus

⚠️ Le mod est encore en évolution. Une mise à jour future est prévue.

Après validation du paiement, l'achat sera ajouté automatiquement dans votre compte.`
    },

    jobs: {
        image: "images/survie.png",
        tag: "Minecraft • Bedrock",
        title: "Système de jobs",
        price: "4,99 €",
        available: false,
        status: "maintenance",
        desc: `⛏️ Système de jobs Minecraft Bedrock

Addon comprenant un menu de métiers complet.

Fonctionnalités principales :

• Menu de métiers
• Système de récompenses
• Système de niveaux
• Progression joueur
• Menu d'administration
• Possibilité de réinitialiser la progression d'un joueur

Produit actuellement en maintenance.`
    },

    zombie: {
        image: "images/zombie.png",
        tag: "FiveM",
        title: "Zombie Event",
        price: "19,99 €",
        available: false,
        status: "unavailable",
        desc: `🧟 Zombie Event

Système complet d'événement zombie pour FiveM, pensé pour être simple, pratique et entièrement configurable directement en jeu.

Le script permet de gérer les zombies, les boss, l'infection, les zones, les récompenses et les loots sans modifier les fichiers à chaque changement.

Fonctionnalités principales :

• Menu administrateur complet en jeu
• Ajout, modification ou suppression des loots directement IG
• Loots configurables pour les zombies
• Loots configurables pour les boss
• Loots configurables pour les poubelles
• Loots configurables pour les carcasses de véhicules
• Pourcentages de drop modifiables en jeu
• Zones zombies configurables
• Safe zones configurables
• Boss avec loot spécial
• Système d'infection
• Interface propre et pratique
• Compatible ox_lib, ox_inventory et ox_target
• Pensé pour être simple à gérer pour les staffs

D'autres catégories de loot, de nouveaux boss, de nouvelles zones et d'autres fonctionnalités pourront être ajoutés par la suite.`
    }
};

async function init() {
    try {
        const configResponse = await apiFetch("/api/config");
        const config = await configResponse.json();

        if (!configResponse.ok || !config.supabaseUrl || !config.supabaseAnonKey) {
            throw new Error(config.error || "Configuration Supabase absente");
        }

        supabaseClient = window.supabase.createClient(
            config.supabaseUrl,
            config.supabaseAnonKey
        );

        bindButtons();
        await refreshUser();
        handleUrlStatus();

        supabaseClient.auth.onAuthStateChange(async () => {
            await refreshUser();
        });
    } catch (err) {
        console.error(err);
        showToast("Erreur configuration", "Vérifie ton fichier .env côté serveur.");
    }
}

function bindButtons() {
    document.getElementById("openAuthBtn")?.addEventListener("click", openAuth);
    document.getElementById("accountBtn")?.addEventListener("click", openAccount);
    document.getElementById("loginBtn")?.addEventListener("click", login);
    document.getElementById("registerBtn")?.addEventListener("click", register);
    document.getElementById("accountLogoutBtn")?.addEventListener("click", logout);
}

function handleUrlStatus() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("success") === "1") {
        showToast("Paiement validé", "Ton achat va apparaître dans Mon compte dans quelques secondes.");
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (params.get("cancel") === "1") {
        showToast("Paiement annulé", "Tu peux réessayer quand tu veux.");
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

async function refreshUser() {
    if (!supabaseClient) return;

    const { data } = await supabaseClient.auth.getUser();
    currentUser = data.user || null;

    const openAuthBtn = document.getElementById("openAuthBtn");
    const accountBtn = document.getElementById("accountBtn");

    if (currentUser) {
        openAuthBtn?.classList.add("hidden");
        accountBtn?.classList.remove("hidden");
    } else {
        openAuthBtn?.classList.remove("hidden");
        accountBtn?.classList.add("hidden");
    }
}

function openAuth() {
    document.getElementById("authModal")?.classList.add("show");
}

function closeAuth() {
    document.getElementById("authModal")?.classList.remove("show");
}

async function login() {
    const email = document.getElementById("authEmail")?.value.trim();
    const password = document.getElementById("authPassword")?.value;

    if (!email || !password) {
        return showToast("Champs manquants", "Entre ton email et ton mot de passe.");
    }

    const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        return showToast("Connexion impossible", translateAuthError(error.message));
    }

    closeAuth();
    await refreshUser();
    showToast("Connecté", "Bienvenue sur Olyx Studio.");
}

async function register() {
    const email = document.getElementById("authEmail")?.value.trim();
    const password = document.getElementById("authPassword")?.value;

    if (!email || !password) {
        return showToast("Champs manquants", "Entre ton email et ton mot de passe.");
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
    });

    if (error) {
        return showToast("Inscription impossible", translateAuthError(error.message));
    }

    if (data.user) {
        await supabaseClient.from("profiles").upsert({
            id: data.user.id,
            email,
            username: ""
        });
    }

    closeAuth();
    await refreshUser();
    showToast("Compte créé", "Vérifie ton email si Supabase demande une confirmation.");
}

async function logout() {
    await supabaseClient.auth.signOut();

    currentUser = null;
    closeAccount();
    closePasswordModal();
    await refreshUser();

    showToast("Déconnecté", "À bientôt.");
}

function openAccount() {
    document.getElementById("accountModal")?.classList.add("show");
    loadAccount();
}

function closeAccount() {
    document.getElementById("accountModal")?.classList.remove("show");
}

function openPasswordModal() {
    if (!currentUser) {
        openAuth();
        return showToast("Connexion requise", "Connecte-toi pour changer ton mot de passe.");
    }

    document.getElementById("passwordModal")?.classList.add("show");
}

function closePasswordModal() {
    document.getElementById("passwordModal")?.classList.remove("show");
}

async function changePassword() {
    if (!currentUser) {
        closePasswordModal();
        openAuth();
        return showToast("Connexion requise", "Connecte-toi pour changer ton mot de passe.");
    }

    const oldPassword = document.getElementById("oldPassword")?.value;
    const newPassword = document.getElementById("newPassword")?.value;
    const confirmPassword = document.getElementById("confirmPassword")?.value;

    if (!oldPassword || !newPassword || !confirmPassword) {
        return showToast("Champs manquants", "Remplis tous les champs.");
    }

    if (newPassword.length < 6) {
        return showToast("Mot de passe invalide", "Le nouveau mot de passe doit contenir au moins 6 caractères.");
    }

    if (newPassword !== confirmPassword) {
        return showToast("Erreur", "Les deux nouveaux mots de passe ne correspondent pas.");
    }

    const check = await supabaseClient.auth.signInWithPassword({
        email: currentUser.email,
        password: oldPassword
    });

    if (check.error) {
        return showToast("Erreur", "Mot de passe actuel incorrect.");
    }

    const { error } = await supabaseClient.auth.updateUser({
        password: newPassword
    });

    if (error) {
        return showToast("Erreur", translateAuthError(error.message));
    }

    document.getElementById("oldPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";

    closePasswordModal();
    showToast("Mot de passe modifié", "Ton mot de passe a bien été changé.");
}


async function sendResetPassword() {
    const email = currentUser?.email || document.getElementById("authEmail")?.value.trim();

    if (!email) {
        return showToast("Email manquant", "Entre ton email avant de demander une réinitialisation.");
    }

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/index.html"
    });

    if (error) {
        return showToast("Erreur", "Impossible d'envoyer l'email de réinitialisation.");
    }

    closePasswordModal();
    showToast("Email envoyé", "Un email pour réinitialiser ton mot de passe a été envoyé.");
}

async function getAccessToken() {
    const { data } = await supabaseClient.auth.getSession();
    return data.session?.access_token || null;
}

async function loadAccount() {
    await refreshUser();

    if (!currentUser) {
        closeAccount();
        openAuth();
        return showToast("Connexion requise", "Connecte-toi pour accéder à ton compte.");
    }

    const token = await getAccessToken();

    if (!token) {
        closeAccount();
        openAuth();
        return showToast("Session expirée", "Reconnecte-toi pour accéder à ton compte.");
    }

    const response = await apiFetch("/api/me", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const result = await response.json();

    if (!response.ok) {
        return showToast("Erreur compte", result.error || "Impossible de charger le compte.");
    }

    const accountEmail = document.getElementById("accountEmail");
    const usernameInput = document.getElementById("usernameInput");
    const accountGrade = document.getElementById("accountGrade");

    if (accountEmail) {
        accountEmail.textContent = result.user?.email || currentUser.email || "Email inconnu";
    }

    if (usernameInput) {
        usernameInput.value = result.profile?.username || "";
    }

    if (accountGrade) {
        const grade = result.profile?.grade || "Visiteur";

        accountGrade.textContent = grade;
        accountGrade.className = "grade-badge";

        if (grade === "Visiteur") {
            accountGrade.classList.add("grade-visiteur");
        } else if (grade === "Client") {
            accountGrade.classList.add("grade-client");
        } else if (grade === "Gérant") {
            accountGrade.classList.add("grade-gerant");
        } else if (grade === "Admin") {
            accountGrade.classList.add("grade-admin");
        } else {
            accountGrade.classList.add("grade-visiteur");
        }
    }

    await loadPurchases();
}

async function saveProfile() {
    if (!currentUser) {
        openAuth();
        return showToast("Connexion requise", "Connecte-toi pour modifier ton profil.");
    }

    const username = document.getElementById("usernameInput")?.value.trim() || "";
    const token = await getAccessToken();

    const response = await apiFetch("/api/profile", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ username })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
        return showToast("Erreur", result.error || "Impossible de sauvegarder ton profil.");
    }

    showToast("Profil sauvegardé", "Ton pseudo a bien été enregistré.");
}

async function loadPurchases() {
    const box = document.getElementById("purchasesList");
    if (!box) return;

    box.innerHTML = `<p class="muted">Chargement des achats...</p>`;

    const token = await getAccessToken();

    if (!token) {
        box.innerHTML = `<p class="muted">Connecte-toi pour voir tes achats.</p>`;
        return;
    }

    const response = await apiFetch("/api/my-purchases", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const result = await response.json();

    if (!response.ok || !result.purchases || result.purchases.length === 0) {
        box.innerHTML = `<p class="muted">Aucun achat pour le moment.</p>`;
        return;
    }

    box.innerHTML = result.purchases.map(p => {
        const price = p.amount_total
            ? (p.amount_total / 100).toFixed(2).replace(".", ",") + " €"
            : "Payé";

        const date = new Date(p.created_at).toLocaleString("fr-FR");

        return `
            <div class="purchase-card">
                <div>
                    <h3>${escapeHtml(p.product_name)}</h3>
                    <p>${price} • ${date}</p>
                </div>

              <button class="btn small" onclick="downloadPurchase('${p.id}')">
    Télécharger
</button>
            </div>
        `;
    }).join("");
}

async function downloadPurchase(id) {
    const token = await getAccessToken();

    console.log("TOKEN DOWNLOAD =", token);

    if (!token) {
        return showToast("Connexion requise", "Reconnecte-toi pour télécharger.");
    }

    const response = await apiFetch(`/api/download/${id}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = await response.json();

    if (!response.ok) {
        return showToast("Erreur téléchargement", data.error || "Téléchargement impossible.");
    }

    window.open(data.url, "_blank");
}

function openProduct(id) {
    const product = products[id];
    if (!product) return;

    document.getElementById("modalImage").src = product.image;
    document.getElementById("modalTag").textContent = product.tag;
    document.getElementById("modalTitle").textContent = product.title;
    document.getElementById("modalDesc").textContent = product.desc;
    document.getElementById("modalPrice").textContent = product.price;

    const buyButton = document.getElementById("modalBuy");

    if (product.available) {
        buyButton.href = "#";
        buyButton.onclick = function () {
            buyProduct(id);
            return false;
        };
        buyButton.textContent = "Acheter 🛒";
    } else if (product.status === "maintenance") {
        buyButton.href = "#";
        buyButton.onclick = function () {
            showMaintenance();
            return false;
        };
        buyButton.textContent = "En maintenance 🛠️";
    } else {
        buyButton.href = "#";
        buyButton.onclick = function () {
            showNotif();
            return false;
        };
        buyButton.textContent = "Indisponible 🔒";
    }

    document.getElementById("productModal")?.classList.add("show");
}

function closeProduct() {
    document.getElementById("productModal")?.classList.remove("show");
}

async function buyProduct(productId) {
    if (!currentUser) {
        closeProduct();
        openAuth();
        return showToast("Connexion requise", "Connecte-toi avant d’acheter.");
    }

    // Produit gratuit
    if (productId === "jobs") {

        const token = await getAccessToken();

        const response = await apiFetch("/api/test-free-purchase", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ productId: "jobs" })
        });

        const result = await response.json();

        if (!response.ok) {
            return showToast(
                "Produit déjà obtenu",
                translateAuthError(result.error)
            );
        }   
        closeProduct();

        showToast(
            "Produit ajouté",
            "Le Système de jobs a été ajouté à votre compte."
        );

        if (typeof loadPurchases === "function") {
            await loadPurchases();
        }

        return;
    }

    // Produits payants
    const token = await getAccessToken();

    const response = await apiFetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ productId })
    });

    const result = await response.json();

    if (!response.ok) {
        return showToast(
            "Erreur paiement",
            result.error || "Impossible de créer le paiement."
        );
    }

    window.location.href = result.url;
}

function showNotif() {
    const notif = document.getElementById("notif");
    if (!notif) return;

    notif.classList.add("show");
    setTimeout(() => notif.classList.remove("show"), 3500);
}

function showMaintenance() {
    const notif = document.getElementById("notifMaintenance");
    if (!notif) return;

    notif.classList.add("show");
    setTimeout(() => notif.classList.remove("show"), 3500);
}

function showToast(title, message) {

    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 850;

    gain.gain.value = 0.03;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();

    setTimeout(() => {
        osc.stop();
    }, 120);

    const toast = document.getElementById("toast");

    if (!toast) {
        alert(`${title}\n${message}`);
        return;
    }

    document.getElementById("toastTitle").textContent = title;
    document.getElementById("toastText").textContent = message;

    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

function translateAuthError(message) {

    if (!message) {
        return "Une erreur est survenue.";
    }

    if (message.includes("unique_user_product")) {
        return "Vous possédez déjà ce produit.";
    }

    if (message.includes("duplicate key value")) {
        return "Ce produit est déjà présent dans votre bibliothèque.";
    }

    if (message.includes("Invalid login credentials")) {
        return "Email ou mot de passe incorrect.";
    }

    if (message.includes("Email not confirmed")) {
        return "Veuillez confirmer votre adresse email.";
    }

    if (message.includes("Too many requests")) {
        return "Trop de tentatives, réessayez plus tard.";
    }

    if (message.includes("invalid format")) {
        return "Adresse email invalide.";
    }

    if (message.includes("Password")) {
        return "Le mot de passe doit contenir au moins 6 caractères.";
    }

    if (message.includes("already registered")) {
        return "Cette adresse email est déjà utilisée.";
    }

    return "Une erreur est survenue.";
}
function escapeHtml(text) {
    return String(text || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

window.openAuth = openAuth;
window.closeAuth = closeAuth;
window.openAccount = openAccount;
window.closeAccount = closeAccount;
window.openProduct = openProduct;
window.closeProduct = closeProduct;
window.saveProfile = saveProfile;
window.logout = logout;
window.openPasswordModal = openPasswordModal;
window.closePasswordModal = closePasswordModal;
window.changePassword = changePassword;
window.sendResetPassword = sendResetPassword;
window.downloadPurchase = downloadPurchase;

init();
