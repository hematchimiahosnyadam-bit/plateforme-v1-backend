const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const TYPES_AUTORISES = ['image/jpeg', 'image/png', 'image/webp'];
const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo

const stockage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/produits'));
  },
  filename: (req, file, cb) => {
    // Nom aléatoire : jamais le nom d'origine envoyé par l'utilisateur,
    // pour éviter tout risque d'écrasement de fichier ou d'injection de chemin.
    const nomAleatoire = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${nomAleatoire}${extension}`);
  },
});

function filtreFichier(req, file, cb) {
  if (!TYPES_AUTORISES.includes(file.mimetype)) {
    return cb(new Error('Format non autorisé (jpg, png ou webp uniquement)'));
  }
  cb(null, true);
}

const upload = multer({
  storage: stockage,
  fileFilter: filtreFichier,
  limits: { fileSize: TAILLE_MAX, files: 6 }, // 6 images max par envoi
});

// Même logique que "upload" ci-dessus, mais rangé dans uploads/medias
// plutôt que uploads/produits : sert à la médiathèque du dashboard
// (hero, message de bienvenue, miniature vidéo...), un seul fichier à
// la fois puisque c'est toujours un remplacement d'image ponctuel.
const stockageMedias = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/medias'));
  },
  filename: (req, file, cb) => {
    const nomAleatoire = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${nomAleatoire}${extension}`);
  },
});

const uploadMedia = multer({
  storage: stockageMedias,
  fileFilter: filtreFichier,
  limits: { fileSize: TAILLE_MAX, files: 1 },
});

module.exports = { upload, uploadMedia };
