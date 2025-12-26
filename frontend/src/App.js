import React, { useState, useEffect } from "react";

import "./App.css";

function App() {
  const [mode, setMode] = useState("login");
  const [formData, setFormData] = useState({
    email: "",
    nom: "",
    prenom: "",
    password: "",
  });
  const [user, setUser] = useState(null);
  const [token, setToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [images, setImages] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [style, setStyle] = useState("professional_indoor");
  const [flowType, setFlowType] = useState("style"); // "style" | "auto" | "lab"
  const [postText, setPostText] = useState("");
  const [postInputMode, setPostInputMode] = useState("manual"); // "select" | "manual"
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  
  // Lab mode states
  const [labData, setLabData] = useState({
    prenom: "",
    nom: "",
    entreprise: "",
    siteWeb: "",
    linkedin: "",
  });
  const [labImages, setLabImages] = useState([]);
  const [labPostText, setLabPostText] = useState("");
  const [labAnalysis, setLabAnalysis] = useState(null);
  const [labSelectedImage, setLabSelectedImage] = useState(null);
  const [labTop3Images, setLabTop3Images] = useState([]);
  const [labLoading, setLabLoading] = useState(false);
  const [labCurrentImageIndex, setLabCurrentImageIndex] = useState(0);
  const [labTop3CurrentIndex, setLabTop3CurrentIndex] = useState(0);
  const [labStyle, setLabStyle] = useState("professional_indoor");

  // Posts LinkedIn prédéfinis pour les tests - Thèmes très différents
  const predefinedPosts = [
    {
      id: "corporate",
      title: "Corporate Formel (Bureau sérieux)",
      text: "J'ai animé mon 1er atelier LinkedIn en présentiel à Nantes... et ça a dépassé toutes mes attentes ! 🔥\n\nMardi dernier, j'étais à La Cantine X La French Tech Nantes pour atelier 100% LinkedIn, et l'énergie était au rendez-vous.\n\nCe qui m'a le plus marqué ?\n\nLa diversité des participants :\n\n→ Responsables Communication, commerciaux, consultants, dirigeants, etc.\n\n→ Agences, Startups, PME et organismes publics.\n\n→ Des profils LinkedIn allant de \"jamais publié\" à \"ultra actifs\"\n\nAu programme, on a passé en revue les 3 étapes indispensables pour performer sur LinkedIn :\n\n𝟭. \"𝗣𝗼𝘀𝗲 𝘁𝗮 𝗽𝗶𝗲𝗿𝗿𝗲\" : 𝗱𝗲́𝗳𝗶𝗻𝗶𝗿 𝘀𝗼𝗻 𝗽𝗼𝘀𝗶𝘁𝗶𝗼𝗻𝗻𝗲𝗺𝗲𝗻𝘁 & 𝘀𝗮 𝗹𝗶𝗴𝗻𝗲 𝗲́𝗱𝗶𝘁𝗼𝗿𝗶𝗮𝗹𝗲.\n\n• Les participants ont clarifié leur identité LinkedIn : cible, objectif et ligne édito.\n\n• L'exercice \"10 idées en 5 min\" leur a permis de débrider leur créativité.\n\n• BONUS : chacun est reparti avec la liste des 100 idées prêts à utiliser.\n\n𝟮. \"𝗟𝗲 𝗽𝗼𝘀𝘁 𝗾𝘂𝗶 𝗽𝗲𝗿𝗰𝘂𝘁𝗲\" : 𝗺𝗮𝗶̂𝘁𝗿𝗶𝘀𝗲𝗿 𝗹𝗲𝘀 𝗰𝗼𝗱𝗲𝘀 𝗱'𝘂𝗻 𝗯𝗼𝗻 𝗽𝗼𝘀𝘁.\n\n• Les 10 règles d'un contenu qui convertit.\n\n• Analyse de posts performants (et moins performants...) en direct sur LinkedIn.\n\n• Exercice d'écriture d'accroche en 60 secondes chrono.\n\n𝟯. \"𝗢𝗿𝗴𝗮𝗻𝗶𝘀𝗮𝘁𝗶𝗼𝗻 𝗲𝘁 𝗿𝗲́𝗴𝘂𝗹𝗮𝗿𝗶𝘁𝗲́\" : 𝗹𝗮 𝘀𝘁𝗿𝗮𝘁𝗲́𝗴𝗶𝗲 𝗰𝗼𝗻𝗰𝗿𝗲̀𝘁𝗲.\n\n• Identification des obstacles personnels à la publication.\n\n• Définition d'un rythme réaliste et d'un créneau dédié au batching.\n\n• Création d'un mini plan éditorial prêt à l'emploi.\n\nLe résultat ? Tout le monde est reparti avec :\n\n✅ Une ligne éditoriale claire et alignée avec ses objectifs\n\n✅ Des idées de posts exploitables immédiatement\n\n✅ Un système simple pour publier sans s'épuiser\n\nCerise sur la gâteau: les participants ont pu mettre en application tous ces conseils avec un outil clé en main...\n\nJ'ai nommé : Lyter 🔥\n\nL'outil leur a :\n\n1. Proposé des idées de posts ultra-personnalisés.\n\n2. Rédigé avec leurs style d'écriture en 30 sec.\n\n3. Programmé au meilleur moment sur leur compte.\n\n→ En 5 minutes, ils ont obtenus plusieurs posts prêts à publier 🙌\n\nUn grand merci à Emma VALLET et Alicia MARCHAND pour l'organisation de cet atelier à La Cantine Nantes !\n\nEt merci à tous les participants : Clémence Denigot, Emmanuelle Desaubliaux, Camille Peigné, Laurent Boisneau, Philippine Mahé, Guillaume PERDEREAU, Dr. HADJ-BACHIR Mokrane, Enora Bloc, Maelenn Le leu et Patrice Jadeau.\n\n Votre énergie et vos retours m'ont énormément touché 🙏",
    },
    {
      id: "atelier",
      title: "Atelier LinkedIn (Événement présentation)",
      text: "Mardi prochain, j'interviens à La Cantine X La French Tech Nantes. 🎤\n\n1h pour accélérer sur LinkedIn avec une méthode concrète ↓\n\nPour tous les acteurs BtoB, LinkedIn est INCONTOURNABLE en 2025.\n\nEn France, on compte 13 millions d'utilisateurs 😏\n\nMais quand on est indépendant ou dirigeant d'une petite entreprise, les mêmes questions reviennent toujours :\n\n→ Quelle est la bonne fréquence pour publier ?\n\n→ Comment trouver des idées de posts qui convertissent ?\n\n→ Comment créer du contenu pertinent sans y passer des heures ?\n\nPendant 1h, je vais vous partager une méthode concrète pour :\n\n✅ Définir votre ligne éditoriale qui convertit.\n\n✅ Trouver des idées de posts alignées avec votre expertise.\n\n✅ Créer du contenu percutant... sans y consacrer tout votre temps !\n\nC'est un atelier 100% pratique conçu pour vous faire gagner du temps et maximiser votre impact sur LinkedIn.\n\nL'atelier s'inscrit dans le cadre du Gang Communication & Marketing (réservés aux adhérents)\n\n👉 https://lnkd.in/eq_MYHa8\n\nLes infos pratiques :\n\n📆 2 décembre 2025. 11h30 - 12h30\n\n📍 La Cantine X La French Tech Nantes - 40 Rue la Tour d'Auvergne, 44200 Nantes.\n\nCet atelier fait suite au User Test de Lyter réalisé il y a quelques mois à La Cantine.\n\nAlban Le Bail, Molid NOUR AWALEH, Reine BOLOUNDZA, Ingrid Baudry, Jérôme LEPELLETIER, Marie Longépé, Ophélie Dos Santos, Juliette Roubaud, Jessy Martin, Loïc Renaud, Guillaume Parthenay.\n\nVos nombreuses questions sur LinkedIn nous ont donné l'idée de ce nouveau format.\n\nOn se retrouve mardi prochain ? 😉\n\nUn grand merci à Emma VALLET et Alicia MARCHAND pour l'organisation.\n\nCe atelier n'aurait pas été possible non plus sans l'Incubateur d'IMT Atlantique, adhérent à La Cantine X La French Tech Nantes. Merci pour cette opportunité !\n\nÀ mardi prochain ✌️",
    },
    {
      id: "live",
      title: "Live Solopreneur (Templates posts)",
      text: "Vendredi dernier, j'étais en live dans l'Incubateur Solopreneur de Flavie Prevot. 🎙️\n\nJ'y ai partagé 3 posts ultra-efficaces pour obtenir des clients :\n\nParce qu'on est d'accord : publier pour publier ne sert à rien.\n\nCe qui compte, c'est de transformer vos lecteurs en prospects, puis en clients.\n\nPendant 1h intense, j'ai partagé une méthode clé en main pour créer du contenu qui converti sans s'épuiser avec Lyter.\n\nJ'en ai profité pour livrer 3 templates de posts ultra-efficaces pour générer des leads sur LinkedIn :\n\n𝟭. 𝗟𝗲 𝘁𝗲𝗺𝗽𝗹𝗮𝘁𝗲 \"𝗔𝘃𝗶𝘀 𝗖𝗹𝗶𝗲𝗻𝘁\"\n\n• Récupérez un avis Google, LinkedIn ou même un message privé.\n\n• Copiez-le puis demandez à Lyter de rédiger un post en un clic.\n\n→ Résultat : un post avec de la preuve sociale ++ qui rassure vos prospects.\n\nASTUCE : prenez 10 avis et programmez 1 post par mois.\n\nEn 15 min, vous renforcez votre crédibilité sur le long terme.\n\n𝟮. 𝗟𝗲 𝘁𝗲𝗺𝗽𝗹𝗮𝘁𝗲 \"𝟯 𝗘𝗿𝗿𝗲𝘂𝗿𝘀 𝗙𝗿𝗲́𝗾𝘂𝗲𝗻𝘁𝗲𝘀\"\n\n• Listez 3 erreurs courantes dans votre domaine\n\n• Expliquez à Lyter comment les éviter (en montrant subtilement votre valeur)\n\n→ Résultat : vous démontrez votre expertise sans paraître arrogant\n\n𝟯. 𝗟𝗲 𝘁𝗲𝗺𝗽𝗹𝗮𝘁𝗲 \"𝗥𝗲𝗰𝘆𝗰𝗹𝗮𝗴𝗲 𝗱𝗲 𝗖𝗼𝗻𝘁𝗲𝗻𝘂\"\n\n• Récupérez un de vos contenus existants à haute valeur ajoutée : newsletter, article, podcast, vidéo, etc.\n\n• Donnez le à Lyter et obtenez un post de teasing en 30 sec.\n\n→ Résultat : vous convertissez vos lecteurs vers des contenus à forte valeur ajoutée.\n\nASTUCE : récupérez 10 contenus existants et recyclez en 1 par mois pour vos 10 prochains mois.\n\nÀ la fin du live, les participants sont repartis avec :\n\n✅ Des idées concrètes de posts qui convertissent.\n\n✅ 1 mois de posts déjà rédigés et prêts à l'emploi pour décembre.\n\n✅ Un système réplicable pour créer ses posts chaque mois en 30 min.\n\nHélène, Augustin, Claire, Priscillia, Sébastien, Léa, Adeline, Christophe Chol, Myriam, Amélie, Cécilia, Charlène, Elisabeth, Emmanuelle, Florie, Julie, Laura, Marine, Mélanie, Nicolas, Séverine et Slanie.\n\nMerci à tous pour votre engagement et votre énergie 🙌\n\nBONUS : pour tous les membres de l'Incubateur Solopreneur, vous bénéficiez d'1 MOIS OFFERT sur Lyter.\n\n→ Ne laissez pas passer cette offre (valable jusqu'au 28/11 à 23h59).\n\nUn immense merci à Flavie Prevot et Marine Aubonnet👩🏻‍🎤 pour l'organisation de ce live qui a fait carton plein.\n\nVotre communauté est incroyable de bienveillance et de motivation 💜",
    },
    {
      id: "creator",
      title: "Paris Creator Week (Événement Station F)",
      text: "J'ai été invité à la Paris Creator Week à STATION F ! 🔥\n\nLa Creator Economy explose et c'est le moment d'en faire partie.\n\nC'est l'ensemble des créateurs qui créent du contenu en ligne (Youtube, LinkedIn, Instagram, etc.).\n\nQuelques chiffres qui donnent le vertige :\n\n→ 250 milliards de dollars dans le monde\n\n→ 6,8 milliards en France\n\n→ +25% de croissance annuelle\n\n→ Un potentiel de 31 milliards de dollars et 300 000 créateurs actifs d'ici 3 ans\n\nUn écosystème ne peut pas grandir sans un événement pour se rencontrer, échanger et se structurer.\n\nC'est exactement ce que propose la Paris Creator Week.\n\nLes 9 et 10 décembre, Station F devient LE point de ralliement de tous les acteurs de la Creator Economy :\n\n4000 participants\n\n800 créateurs\n\n200 speakers\n\nUn événement MASSIF qui réunit les plus grands noms :\n\n→ Jean-Marc Jancovici, président de The Shift Project.\n\n→ Matthieu Stefani, créateur du podcast Génération Do It Yourself\n\n→ Jokariz, cofondateur de l'événement.\n\n→ James Grant (Mr Beast)\n\n→ Joyca\n\n→ Et bien d'autres...\n\nC'est le rendez-vous à ne pas manquer.\n\nEt Lyter sera de la partie.\n\nL'occasion notamment de :\n\n- Retrouver nos ambassadeurs Melinda, Aissa en physique cette fois ci ✌️\n\n- Découvrir les figures montantes de l'influence sur LinkedIn 💪\n\n- Nouer des partenariats stratégiques avec d'autres acteurs de l'écosystème 🤝\n\nPS : si tu veux venir, j'ai un code promo exclusif pour toi.\n\n→ Utilise \"PCW2K25\" pour obtenir -20% sur ton billet.\n\nÀ très vite sur place !",
    },
    {
      id: "entrepreneur",
      title: "Entrepreneuriat Étudiant (Conseil lancement)",
      text: "En 2020, j'ai lancé ma boite pendant mes études à IMT Atlantique.\n\nVoici le conseil que je donnerais à un étudiant qui veut se lancer :\n\nC'est simple :\n\nSOIS DÉBROUILLARD.\n\nN'attends pas qu'on t'apporte ce dont tu as besoin.\n\nComme disait un grand poète :\n\n\"Si tu veux faire des films, t'as juste besoin d'un truc qui filme.\n\nDire : « J'ai pas d'matos ou pas d'contact », c'est un truc de victime\"\n\nC'est exactement pareil pour créer sa boite :\n\nEn 2020, en plein confinement j'étais exactement à votre place.\n\nJe voulais créer une application mais :\n\n❌ Je ne savais pas coder\n\n❌ Je n'avais pas d'argent pour payer une agence\n\n❌ Je n'avais pas de réseau dans la tech\n\nPas le choix. J'ai appris à coder une appli de A à Z en regardant des tutos sur Udemy et YouTube.\n\nÇa m'a permis :\n\n→ De lancer la V1 de Metcher avant la fin du confinement.\n\n→ De tester rapidement le marché auprès de l'Icam - Institut Catholique d'Arts et Métiers (notre 1er client).\n\n→ D'acquérir une compétence cruciale qui m'a servi pour tous mes projets suivants.\n\nEt encore.\n\nAujourd'hui avec les outils comme bolt.new, Lovable, ou encore Cursor, c'est 10x plus simple de créer quelque chose sans compétence technique.\n\nLa création est plus accessible que jamais.\n\nC'est ce qu'on a utilisé pour développer la première version de Lyter rapidement.\n\nRésultat ?\n\n✅ Une version bêta sortie en 30 jours grâce au no-code.\n\n✅ Un outil capable de proposer des idées de posts LinkedIn ultra personnalisées et de les rédiger avec votre style d'écriture.\n\n✅ Plus de 2000 utilisateurs en un moins d'un an.\n\nSi tu es étudiant, sache que de nombreux dispositifs existent pour t'aider à lancer ta boîte :\n\n→ L'incubateur de ton école, comme l'Incubateur d'IMT Atlantique pour moi.\n\n→ Le réseau Pépite France - Le réseau des Étudiants-Entrepreneurs présent un peu partout en France.\n\n→ Des associations comme l'Association - Passeport Armorique pour Entreprendre, Entreprendre Pour Apprendre / JA France ou Les Entrep'​.\n\nVous avez une idée qui vous trotte dans la tête ?\n\nC'est LE moment de passer à l'action.\n\nLa meilleure façon d'apprendre, c'est de faire. 👊\n\n------------\n\nPS : Si tu me découvres avec ce post, je m'appelle Théo Fontenit 👋\n\nJe suis le cofondateur de Lyter, l'outil qui te permet de créer tes posts LinkedIn pour un mois entier, en seulement 30 min.",
    },
    {
      id: "challenge",
      title: "Challenge Rentrée (Live formation)",
      text: "Le Challenge de rentrée commence aujourd'hui 🚨\n\nOn vous donne rendez-vous à 12h pour un live exceptionnel. ↓\n\nVous procrastinez sur LinkedIn ? Vous avez du mal à passer à l'action ?\n\nBonne nouvelle : on a LA solution pour vous.\n\nCe mardi 23 septembre à 12h, rejoignez notre live spécial rentrée et créez vos posts en direct.\n\nEn seulement 30 minutes, vous allez découvrir :\n\n→ La méthode complète pour créer du contenu qui performe sur LinkedIn\n\n→ Comment préparer 1 MOIS ENTIER de posts en 30 minutes chrono\n\n→ Les secrets d'une ligne éditoriale qui convertit\n\nLe plus fou ?\n\nVous repartirez avec :\n\n✅ 4 posts LinkedIn prêts à publier dès la fin du live\n\n✅ Une stratégie claire pour toute votre communication LinkedIn\n\n✅ Un max de motivation pour passer à l'action !\n\nPour participer, c'est simple :\n\n1. Bloquez 30 minutes dans votre agenda aujourd'hui à 12h (mettez une alarme pour y penser 🙃)\n\n2. Inscrivez-vous ici pour réserver votre place : https://lnkd.in/eU95mq4G\n\n3. Connectez-vous 5 minutes avant sur votre ordinateur.\n\nVous êtes +100 participants 🔥\n\nMarie, Jean-Marc, Frédéric, Carole, Anne, Laura, Hélène, Marjorie, Delphine, Olivier, Arnaud, Frederique, Coraline, Manon, Estelle, Geneviève, Soizic, Jonathan, Denis, Soumia et tous les autres...\n\nOn se retrouve en live à midi ✌️\n\n--------\n\nPS : Si vous me découvrez avec ce post, je m'appelle Théo Fontenit 👋\n\nJe suis le cofondateur de Lyter, l'outil qui vous permet de créer tous vos posts LinkedIn pour 1 mois entier en 30 min.",
    },
    {
      id: "usertest",
      title: "User Test Lyter (Test produit)",
      text: "On a fait testé Lyter à 10 inconnus... et ils ont adoré ! 🔥\n\nJeudi dernier, nous avons organisé un User Test en partenariat avec La Cantine X La French Tech Nantes.\n\nLe principe est simple : mettre entre les mains de 10 inconnus un produit qu'ils ne connaissent pas.\n\nConcrètement :\n\n→ 10 participants aux profils variés viennent à la Halle 6 pour tester Lyter en live.\n\n→ Ils testent l'outil en toute liberté et repartent avec plusieurs posts prêts à publier.\n\n→ On observe et on pose des tonnes de questions pour recueillir un max de retours.\n\nRésultats, une mine d'or d'informations ultra qualitatives sur :\n\n• L'ergonomie de notre interface\n\n• L'expérience utilisateur globale\n\n• Les éventuels bugs ou points de friction\n\n• Les fonctionnalités les plus appréciées\n\nLes retours ont été fantastiques et nous donnent énormément de confiance pour la suite.\n\nVoici quelques verbatims qui nous ont particulièrement touchés :\n\n\"Jamais je n'aurais imaginé créer 4 posts aussi rapidement\"\n\n\"La qualité des textes est bluffante, on dirait vraiment mon style\"\n\n\"Enfin une solution qui comprend mes besoins en tant que freelance\"\n\nNotre produit s'améliore chaque semaine, et ça se ressent clairement dans vos retours.\n\nUn grand merci à tous les participants pour votre temps et vos précieux retours Alban Le Bail, Molid NOUR AWALEH, Reine BOLOUNDZA, Ingrid Baudry, Jérôme LEPELLETIER, Marie Longépé, Ophélie Dos Santos, Juliette Roubaud, Jessy Martin et Loïc Renaud 🫶\n\nUn grand merci aussi à la Cantine et à Emma VALLET pour l'organisation du User Test.\n\nCe test n'aurait pas été possible non plus sans l'Incubateur d'IMT Atlantique, adhérent à La Cantine Nantes. Merci pour cette opportunité !\n\nVous aussi, vous voulez tester Lyter et créer un mois entier de posts LinkedIn en 30 minutes ?\n\n👉 C'est par ici : https://www.lyter.ai/t\n\n---------\n\nPS : Si vous me découvrez avec ce post, je m'appelle Théo Fontenit 👋\n\nJe suis le cofondateur de Lyter, l'outil qui vous permet de créer tous vos posts LinkedIn pour 1 mois entier en 30 min.",
    },
    {
      id: "anniversaire",
      title: "Anniversaire Lyter (Offre spéciale)",
      text: "Lyter souffle sa première bougie 👶\n\nPlus que 7 jours pour profiter de son cadeau d'anniversaire ↓\n\nComme vous le savez, Lyter a bien grandi.\n\nAujourd'hui, il est plus affûté que jamais :\n\n✅ Il a des idées de posts qui fusent à toute vitesse\n\n✅ Il écrit des posts LinkedIn comme un pro (déja +3000 posts écrits à son actif)\n\n✅ Il connaît LinkedIn comme sa poche et programme vos posts au meilleur moment.\n\nPour célébrer son anniversaire comme il se doit, on vous fait un cadeau :\n\n→ Nous vous offrons 200€ pour bénéficier de ses services 🎁\n\nL'offre est valable pendant 7 jours.\n\nEt en bonus, Lyter a décidé d'offrir 1 an d'abonnement à l'un d'entre vous.\n\nToutes les personnes qui souscrivent avant le 28/04 sont inscrites au tirage au sort pour gagner 1 an d'abonnement (valeur : 948€).\n\nLe tirage aura lieu lundi 28/04 à 12h en direct sur LinkedIn lors d'un événement spécial.\n\nAu programme de ce live :\n\n→ Découvrez les meilleurs hacks pour optimiser votre présence LinkedIn.\n\n→ Une session Q&R complète sur Lyter (posez-nous toutes vos questions !)\n\n→ Le tirage au sort en direct avec l'heureux gagnant\n\nPour participer, c'est simple :\n\n1. Bloquez 30 min dans votre agenda lundi prochain à 12h.\n\n2. Inscrivez-vous sur l'événement LinkedIn : https://lnkd.in/e4-cBbpd\n\n3. Préparez vos questions sur LinkedIn ou Lyter.\n\nLe nombre de places est limité, alors ne tardez pas.\n\nA lundi en live ✌️\n\n-----------\n\nPS : Si vous me découvrez avec ce post, je m'appelle Théo Fontenit 👋\n\nJe suis le cofondateur de Lyter, l'outil qui vous permet de créer tous vos posts LinkedIn pour 1 mois entier en 30 min.\n\nCe post a été rédigé par Lyter lui-même 👶",
    },
  ];

  const [numberOfImages, setNumberOfImages] = useState(3);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ---------------- SIGNUP ----------------
  const handleSignup = async (e) => {
    e.preventDefault();

    const res = await fetch("http://localhost:5000/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    alert(data.message);
  };

  // ---------------- LOGIN ----------------
  const handleLogin = async (e) => {
    e.preventDefault();

    const res = await fetch("http://localhost:5000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formData.email, password: formData.password }),
    });

    const data = await res.json();

    if (data.success) {
      setUser({ email: formData.email, nom: data.nom, prenom: data.prenom });
      setToken(data.token);
    } else {
      alert("Login failed");
    }
  };

  // ---------------- UPLOAD PHOTOS ----------------
  const handleUpload = (event) => {
    const files = Array.from(event.target.files);
    const maxPhotos = flowType === "auto" ? 2 : 10;

    if (files.length + photos.length > maxPhotos) {
      alert(`You can upload a maximum of ${maxPhotos} photos for this mode.`);
      return;
    }

    setPhotos([...photos, ...files]);
  };

  const handleDeletePhoto = (index) => {
    const newPhotos = [...photos];
    newPhotos.splice(index, 1);
    setPhotos(newPhotos);
  };


  // Ajustement auto-prompt
  React.useEffect(() => {
    if (flowType === "auto") {
      // Auto mode: max 2 photos, fixed 2 images generated
      if (photos.length > 2) {
        setPhotos((prev) => prev.slice(0, 2));
      }
      if (numberOfImages !== 2) {
        setNumberOfImages(2);
      }
    } else if (flowType === "style") {
      // Style mode: reset to default if it was forced to 2 by auto mode
      if (numberOfImages === 2) {
        setNumberOfImages(3);
      }
    }
  }, [flowType, photos.length]);

  // Charger les images Lab quand le mode Lab est activé et que l'utilisateur est connecté
  React.useEffect(() => {
    // Toujours vider la galerie Lab quand on change de mode ou d'utilisateur
    if (flowType !== "lab") {
      setLabImages([]);
      setLabCurrentImageIndex(0);
      return;
    }

    const loadLabImages = async () => {
      // Vérifier que l'utilisateur est connecté avec un email valide
      if (!user?.email || user.email === "anonymous" || user.email === "user" || !user.email.includes("@")) {
        console.log("ℹ️ Utilisateur non connecté ou email invalide. La galerie Lab sera vide.");
        setLabImages([]);
        setLabCurrentImageIndex(0);
        return;
      }

      // Vider la galerie avant de charger pour éviter d'afficher d'anciennes données
      setLabImages([]);
      setLabCurrentImageIndex(0);

      try {
        const imagesRes = await fetch(`http://localhost:5000/gallery/lab/${encodeURIComponent(user.email)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        
        if (!imagesRes.ok) {
          // Si erreur HTTP (404, 500, etc.), considérer qu'il n'y a pas d'images
          if (imagesRes.status === 404) {
            console.log("ℹ️ Endpoint /gallery/lab/:email non trouvé. Le serveur backend doit être redémarré ou la route n'existe pas encore.");
          }
          setLabImages([]);
          setLabCurrentImageIndex(0);
          return;
        }
        
        const imagesData = await imagesRes.json();
        console.log(`📊 Réponse Firestore pour ${user.email}:`, {
          success: imagesData.success,
          count: imagesData.count || 0,
          imagesLength: imagesData.images?.length || 0
        });

        if (imagesData.success && imagesData.images && Array.isArray(imagesData.images)) {
          const labImagesFromFirestore = imagesData.images.map(img => ({
            id: img.id,
            u: img.u || img.url, // Schéma conforme : champ u
            url: img.url || img.u, // Alias pour compatibilité
            t: img.t || img.tags || [], // Schéma conforme : champ t
            tags: img.tags || img.t || [], // Alias pour compatibilité
            p: img.p ?? img.context?.p ?? 1, // Schéma conforme : champ p
            s: img.s || img.context?.s || "photo", // Schéma conforme : champ s
            x: img.x || img.context?.x || [], // Schéma conforme : champ x
            d: img.d || img.context?.d || "Image visuelle professionnelle.", // Schéma conforme : champ d
            source: img.source || "unknown",
            created_at: img.created_at,
            context: img.context || {}, // Garder pour compatibilité
          }));
          
          setLabImages(labImagesFromFirestore);
          if (labImagesFromFirestore.length > 0) {
            setLabCurrentImageIndex(0);
            console.log(`✅ Loaded ${labImagesFromFirestore.length} Lab images from Firestore for ${user.email}`);
          } else {
            console.log(`ℹ️ No Lab images found for ${user.email}. User needs to fetch visuals first.`);
          }
        } else {
          console.log(`ℹ️ No valid Lab images in response for ${user.email}`);
          setLabImages([]);
          setLabCurrentImageIndex(0);
        }
      } catch (imgErr) {
        console.error("Error loading Lab images from Firestore:", imgErr);
        // En cas d'erreur réseau, s'assurer que la galerie est vide
        setLabImages([]);
        setLabCurrentImageIndex(0);
      }
    };

    loadLabImages();
  }, [flowType, user?.email]);

  // ---------------- GENERATE IMAGE ----------------
  const handleGenerate = async () => {
    if (photos.length === 0) {
      alert("Upload at least one photo");
      return;
    }

    if (flowType === "style" && !style) {
      alert("Choose a style first");
      return;
    }

    if (flowType === "auto") {
      if (!postText.trim()) {
        alert("Add the post text to generate a prompt.");
        return;
      }
      if (photos.length < 1) {
        alert("Ajoute au moins 1 selfie (max 2) pour le mode auto-prompt.");
        return;
      }
      if (photos.length > 2) {
        alert("Max 2 selfies en mode auto-prompt.");
        return;
      }
    }

    setLoading(true);
    setImages([]);
    setGeneratedPrompt("");
    setSelectedImageIndex(null);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => (prev >= 90 ? 90 : prev + 2));
    }, 100);

    const base64Photos = await Promise.all(
      photos.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );

    try {
      const desiredCount = flowType === "auto" ? 2 : numberOfImages;
      console.log(`[FRONTEND] Generating ${desiredCount} images (flowType: ${flowType}, numberOfImages: ${numberOfImages})`);
      const endpoint = flowType === "auto" ? "generate-auto" : "generate";

      const body =
        flowType === "auto"
          ? {
              email: user?.email || "anonymous",
              postText,
              photos: base64Photos,
              numberOfImages: desiredCount,
            }
          : {
              email: user?.email || "anonymous",
              style,
              photos: base64Photos,
              numberOfImages: desiredCount,
            };

      const res = await fetch(`http://localhost:5000/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      clearInterval(progressInterval);
      setProgress(100);

      if (data.success) {
        if (data.prompt) {
          setGeneratedPrompt(data.prompt);
        } else if (data.optimizedPrompt) {
          setGeneratedPrompt(data.optimizedPrompt);
        }

        // ✅ Correction : limiter au nombre exact demandé
        if (data.imageUrls && Array.isArray(data.imageUrls)) {
          console.log(`[FRONTEND] Received ${data.imageUrls.length} images, limiting to ${desiredCount}`);
          const unique = Array.from(new Set(data.imageUrls));
          const limited = unique.slice(0, desiredCount);
          console.log(`[FRONTEND] Setting ${limited.length} images in state`);
          setImages(limited);
        } else if (data.imageUrl || data.url) {
          setImages([data.imageUrl || data.url]);
        } else {
          alert("Error: No images received");
        }
      } else {
        alert("Error generating image: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      clearInterval(progressInterval);
      alert("Server error");
    }

    setLoading(false);
    setTimeout(() => setProgress(0), 500);
  };

  // ---------------- SAVE SELECTED IMAGE ----------------
  const handleSaveSelection = async () => {
    if (!user?.email) {
      alert("Please log in to save a selection.");
      return;
    }

    if (selectedImageIndex === null) {
      alert("Please select an image first.");
      return;
    }

    const selectedUrl = images[selectedImageIndex];

    try {
      const res = await fetch("http://localhost:5000/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          imageUrl: selectedUrl,
          prompt: generatedPrompt || style,
          flowType,
        }),
      });

      const data = await res.json();
      alert(data.message || "Selection saved.");
    } catch (err) {
      console.error(err);
      alert("Error saving selection.");
    }
  };

  // ---------------- DOWNLOAD IMAGE ----------------
  const handleDownloadImage = async (imageUrl, imageIdOrIndex) => {
    if (!imageUrl) {
      alert("Image URL missing.");
      return;
    }

    try {
      // Si c'est une URL base64
      if (imageUrl.startsWith("data:")) {
        const link = document.createElement("a");
        link.href = imageUrl;
        const filename = typeof imageIdOrIndex === "string" 
          ? `image-${imageIdOrIndex}.png`
          : `generated-image-${(imageIdOrIndex || 0) + 1}-${Date.now()}.png`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
        }, 100);
        return;
      }

      // Si c'est une URL HTTP/HTTPS (Firebase Storage, etc.)
      if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
        try {
          // Essayer d'abord sans paramètre de cache
          let response = await fetch(imageUrl, {
            method: "GET",
            mode: "cors",
            cache: "no-cache",
          });

          // Si ça échoue, essayer avec alt=media pour Firebase Storage
          if (!response.ok && imageUrl.includes("storage.googleapis.com")) {
            const urlWithAlt = imageUrl + (imageUrl.includes("?") ? "&" : "?") + "alt=media";
            response = await fetch(urlWithAlt, {
              method: "GET",
              mode: "cors",
              cache: "no-cache",
            });
          }

          if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
          }

          const blob = await response.blob();
          
          if (!blob || blob.size === 0) {
            throw new Error("Downloaded file is empty");
          }

          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.style.display = "none";
          
          // Déterminer l'extension depuis le Content-Type ou l'URL
          let extension = "jpg";
          const contentType = response.headers.get("content-type");
          if (contentType) {
            if (contentType.includes("png")) extension = "png";
            else if (contentType.includes("gif")) extension = "gif";
            else if (contentType.includes("webp")) extension = "webp";
            else if (contentType.includes("jpeg") || contentType.includes("jpg")) extension = "jpg";
          } else {
            // Essayer d'extraire depuis l'URL
            const urlMatch = imageUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)/i);
            if (urlMatch) {
              extension = urlMatch[1].toLowerCase();
              if (extension === "jpeg") extension = "jpg";
            }
          }
          
          const filename = typeof imageIdOrIndex === "string" 
            ? `image-${imageIdOrIndex}.${extension}`
            : `generated-image-${(imageIdOrIndex || 0) + 1}-${Date.now()}.${extension}`;
          
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          
          // Nettoyer après un court délai
          setTimeout(() => {
            window.URL.revokeObjectURL(url);
            if (document.body.contains(a)) {
              document.body.removeChild(a);
            }
          }, 200);
        } catch (fetchErr) {
          console.error("Erreur fetch:", fetchErr);
          // Fallback: essayer avec un lien direct
          const link = document.createElement("a");
          link.href = imageUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          const filename = typeof imageIdOrIndex === "string"
            ? `image-${imageIdOrIndex}.jpg`
            : `generated-image-${(imageIdOrIndex || 0) + 1}-${Date.now()}.jpg`;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            if (document.body.contains(link)) {
              document.body.removeChild(link);
            }
          }, 100);
        }
      } else {
        // Ancien comportement pour compatibilité
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = typeof imageIdOrIndex === "string"
          ? `image-${imageIdOrIndex}-${Date.now()}.png`
          : `generated-image-${(imageIdOrIndex || 0) + 1}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
        }, 100);
      }
    } catch (err) {
      console.error("Error downloading:", err);
      alert("Error downloading image: " + (err.message || "Unknown error. Try right-clicking on the image and 'Save image as...'"));
    }
  };

  const handleDownloadAll = async () => {
    if (images.length === 0) {
      alert("No images to download.");
      return;
    }
    for (let i = 0; i < images.length; i += 1) {
      handleDownloadImage(images[i], i);
      await new Promise((resolve) => setTimeout(resolve, 500)); // Delay to prevent browser blocking multiple downloads
    }
  };

  const handleSelectImage = (index) => {
    setSelectedImageIndex(index);
  };

  // ---------------- LAB MODE FUNCTIONS ----------------
  const handleLabDataChange = (e) => {
    setLabData({ ...labData, [e.target.name]: e.target.value });
  };


  const handleIngest = async () => {
    if (!labData.prenom || !labData.nom) {
      alert("Veuillez remplir au moins le prénom et le nom.");
      return;
    }

    setLabLoading(true);
    try {
      const res = await fetch("http://localhost:5000/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "anonymous",
          ...labData,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Après le fetching, recharger les images depuis Firestore pour avoir toutes les données complètes
        try {
          const imagesRes = await fetch(`http://localhost:5000/gallery/lab/${encodeURIComponent(user?.email || "anonymous")}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });
          
          const imagesData = await imagesRes.json();
          if (imagesData.success && imagesData.images) {
            const labImagesFromFirestore = imagesData.images.map(img => ({
              id: img.id,
              u: img.u || img.url, // Schéma conforme : champ u
              url: img.url || img.u, // Alias pour compatibilité
              t: img.t || img.tags || [], // Schéma conforme : champ t
              tags: img.tags || img.t || [], // Alias pour compatibilité
              p: img.p ?? img.context?.p ?? 1, // Schéma conforme : champ p
              s: img.s || img.context?.s || "photo", // Schéma conforme : champ s
              x: img.x || img.context?.x || [], // Schéma conforme : champ x
              d: img.d || img.context?.d || "Image visuelle professionnelle.", // Schéma conforme : champ d
              source: img.source || "unknown",
              created_at: img.created_at,
              context: img.context || {}, // Garder pour compatibilité
            }));
            
            setLabImages(labImagesFromFirestore);
            if (labImagesFromFirestore.length > 0) {
              setLabCurrentImageIndex(0);
            }
            alert(`✅ ${labImagesFromFirestore.length} visuel(s) récupéré(s) et sauvegardé(s) dans Firestore !`);
          } else {
            // Si le rechargement échoue, utiliser les images de la réponse /ingest
            setLabImages(data.images || []);
            setLabCurrentImageIndex(0);
            alert(`✅ ${data.images?.length || 0} visuel(s) récupéré(s) !`);
          }
        } catch (reloadErr) {
          console.error("Error reloading images from Firestore:", reloadErr);
          // En cas d'erreur, utiliser les images de la réponse /ingest
          setLabImages(data.images || []);
          setLabCurrentImageIndex(0);
          alert(`✅ ${data.images?.length || 0} visuel(s) récupéré(s) !`);
        }
      } else {
        alert("Erreur : " + (data.message || "Échec de la récupération des visuels"));
      }
    } catch (err) {
      console.error(err);
      alert("Erreur serveur lors de la récupération des visuels.");
    }
    setLabLoading(false);
  };


  const handleAnalyzePost = async () => {
    if (!labPostText.trim()) {
      alert("Please enter the post text.");
      return;
    }

    setLabLoading(true);
    try {
      // 1. Analyser le post
      const res = await fetch("http://localhost:5000/post/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "anonymous",
          postText: labPostText,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setLabAnalysis(data.analysis);
        alert("✅ Post analyzed successfully!");
      } else {
        alert("Error: " + (data.message || "Analysis failed"));
      }
    } catch (err) {
      console.error(err);
      alert("Server error during analysis.");
    }
    setLabLoading(false);
  };

  const handleSelectImageLab = async () => {
    if (!labPostText.trim()) {
      alert("Veuillez d'abord saisir le texte du post.");
      return;
    }

    setLabLoading(true);
    try {
      // Si la galerie locale est vide, récupérer les images depuis Firestore d'abord
      if (labImages.length === 0) {
        try {
          const imagesRes = await fetch(`http://localhost:5000/gallery/lab/${encodeURIComponent(user?.email || "anonymous")}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });
          
          const imagesData = await imagesRes.json();
          if (imagesData.success && imagesData.images) {
            // Filtrer uniquement les images Lab (celles qui ont source ou labData)
            const labImagesFromFirestore = imagesData.images
              .filter(img => img.source || img.labData)
              .map(img => ({
                id: img.id,
                u: img.u || img.url, // Schéma conforme : champ u
                url: img.url || img.u, // Alias pour compatibilité
                t: img.t || img.tags || [], // Schéma conforme : champ t
                tags: img.tags || img.t || [], // Alias pour compatibilité
                p: img.p ?? img.context?.p ?? 1, // Schéma conforme : champ p
                s: img.s || img.context?.s || "photo", // Schéma conforme : champ s
                x: img.x || img.context?.x || [], // Schéma conforme : champ x
                d: img.d || img.context?.d || "Image visuelle professionnelle.", // Schéma conforme : champ d
                source: img.source || "unknown",
                created_at: img.created_at,
                context: img.context || {}, // Garder pour compatibilité
              }));
            
            if (labImagesFromFirestore.length > 0) {
              setLabImages(labImagesFromFirestore);
              setLabCurrentImageIndex(0);
              console.log(`✅ Loaded ${labImagesFromFirestore.length} images from Firestore`);
            }
          }
        } catch (imgErr) {
          console.error("Error loading images from Firestore:", imgErr);
          // Continue même si le chargement échoue, l'endpoint /select récupérera les images
        }
      }

      // Sélectionner les 4 meilleures images (l'endpoint /select récupère automatiquement depuis Firestore)
      const res = await fetch("http://localhost:5000/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "anonymous",
          postText: labPostText,
        }),
      });

      const data = await res.json();
      
      if (data.success) {
        // Le backend retourne maintenant top4 avec score, reasons, matched_tags
        const top4Images = data.top4 || [];
        // Convertir le format top4 vers le format attendu par le frontend
        const formattedImages = top4Images.map((img, index) => ({
          id: img.id,
          url: img.url,
          source: img.source || "unknown",
          tags: img.tags || img.matched_tags || [],
          context: img.context || {},
          score: img.score || 0,
          reasons: img.reasons || [],
          matched_tags: img.matched_tags || [],
          p: img.p ?? img.p ?? 1, // Présence de personnes (0/1/2)
          s: img.s || img.s || "photo", // Style (photo/illu/3d/icon)
          rank: index + 1,
        }));
        setLabTop3Images(formattedImages);
        setLabSelectedImage(null); // Réinitialiser la sélection
        setLabTop3CurrentIndex(0); // Réinitialiser l'index du carrousel
        
        if (formattedImages.length === 0) {
          alert("Aucune image recommandée trouvée.");
        } else {
          console.log(`✅ ${formattedImages.length} image(s) sélectionnée(s) avec scores:`, formattedImages.map(img => `${img.score?.toFixed(2) || 'N/A'}`).join(", "));
        }
      } else {
        alert("Erreur : " + (data.message || "La sélection a échoué"));
      }
    } catch (err) {
      console.error(err);
      alert("Erreur serveur lors de la sélection.");
    }
    setLabLoading(false);
  };

  const handleSelectOptimal = async () => {
    if (!labPostText.trim()) {
      alert("Veuillez d'abord saisir le texte du post.");
      return;
    }

    setLabLoading(true);
    try {
      // Sélectionner les 4 meilleures images avec le nouveau prompt optimal
      const res = await fetch("http://localhost:5000/select-optimal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "anonymous",
          postText: labPostText,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ Erreur HTTP:", res.status, errorText);
        throw new Error(`Erreur HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      console.log("📊 Réponse du serveur:", data);
      
      if (data.success) {
        // Le backend retourne top4 avec score, reasons, matched_tags
        const top4Images = data.top4 || [];
        // Convertir le format top4 vers le format attendu par le frontend
        const formattedImages = top4Images.map((img, index) => ({
          id: img.id,
          url: img.url || img.u,
          source: img.source || "unknown",
          tags: img.tags || img.matched_tags || [],
          context: img.context || {},
          score: img.score || 0,
          reasons: img.reasons || [],
          matched_tags: img.matched_tags || [],
          p: img.p ?? 1, // Présence de personnes (0/1/2)
          s: img.s || "photo", // Style (photo/illu/3d/icon)
          rank: index + 1,
        }));
        setLabTop3Images(formattedImages);
        setLabSelectedImage(null); // Réinitialiser la sélection
        setLabTop3CurrentIndex(0); // Réinitialiser l'index du carrousel
        
        if (formattedImages.length === 0) {
          alert("Aucune image recommandée trouvée.");
        } else {
          console.log(`✅ ${formattedImages.length} image(s) sélectionnée(s) avec scores (sélection optimale):`, formattedImages.map(img => `${img.score?.toFixed(2) || 'N/A'}`).join(", "));
        }
      } else {
        console.error("❌ Erreur dans la réponse:", data);
        alert("Erreur : " + (data.message || "La sélection optimale a échoué"));
      }
    } catch (err) {
      console.error("❌ Erreur complète:", err);
      console.error("❌ Message d'erreur:", err.message);
      console.error("❌ Stack trace:", err.stack);
      alert("Erreur serveur lors de la sélection optimale: " + (err.message || "Erreur inconnue"));
    }
    setLabLoading(false);
  };

  const handleSaveSelectedImage = async (imageId) => {
    if (!imageId) {
      alert("No image selected.");
      return;
    }

    if (!labTop3Images || labTop3Images.length === 0) {
      alert("No images available to save.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/select/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "anonymous",
          imageId: imageId,
          postText: labPostText || "",
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      if (data.success) {
        // Trouver l'image dans top3Images et la définir comme sélectionnée
        const selectedImg = labTop3Images.find(img => img.id === imageId);
        if (selectedImg) {
          setLabSelectedImage(selectedImg);
          alert("✅ Image saved successfully to Firestore!");
        } else {
          alert("⚠️ Image saved but not found in the list.");
        }
      } else {
        alert("Error: " + (data.message || "Save failed"));
      }
    } catch (err) {
      console.error("Error during save:", err);
      alert("Server error during save: " + (err.message || "Unknown error"));
    }
  };


  const handleDeleteAll = async () => {
    if (!user?.email) {
      alert("No user email found.");
      return;
    }

    const res = await fetch(`http://localhost:5000/delete/${user.email}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    alert(data.message);

    if (data.success) {
      setPhotos([]);
      setImages([]);
      setUser(null);
      setToken("");
    }
  };

  const handleLogout = () => {
    alert("You have been logged out.");
    setUser(null);
    setToken("");
  };

  // ---------------- RENDER ----------------
  return (
    <div className="container">
      {!user ? (
        <>
          <h1 className="title">Welcome to Lyter – Create your professional photos ✨</h1>

          <div className="toggle">
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
              Sign Up
            </button>
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
              Login
            </button>
          </div>

          <form className="form" onSubmit={mode === "signup" ? handleSignup : handleLogin}>
            {mode === "signup" && (
              <>
                <input
                  type="text"
                  name="nom"
                  placeholder="Last Name"
                  value={formData.nom}
                  onChange={handleChange}
                  required
                />
                <input
                  type="text"
                  name="prenom"
                  placeholder="First Name"
                  value={formData.prenom}
                  onChange={handleChange}
                  required
                />
              </>
            )}

            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
            />

            <div className="password-container">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            <button type="submit" className="submit-btn">
              {mode === "signup" ? "Sign Up" : "Login"}
            </button>
          </form>
        </>
      ) : (
        <div className="dashboard">
          <h2 className="welcome">
            Welcome {user.prenom} {user.nom} 🎉
          </h2>

          <div className="layout">
            {/* Left side */}
            <div className="upload-section">
              <div className="scenario-toggle">
                <button
                  className={flowType === "style" ? "active" : ""}
                  onClick={() => setFlowType("style")}
                >
                  Predefined style mode
                </button>
                <button
                  className={flowType === "auto" ? "active" : ""}
                  onClick={() => setFlowType("auto")}
                >
                  Mode auto-prompt (texte + selfies)
                </button>
                <button
                  className={flowType === "lab" ? "active" : ""}
                  onClick={() => setFlowType("lab")}
                >
                  Lab
                </button>
              </div>

              {flowType === "lab" ? (
                <div className="lab-section">
                  <h3>🔬 Lab Mode</h3>
                  
                  <div className="lab-form">
                    <h4>📋 Information</h4>
                    <input
                      type="text"
                      name="prenom"
                      placeholder="First Name"
                      value={labData.prenom}
                      onChange={handleLabDataChange}
                    />
                    <input
                      type="text"
                      name="nom"
                      placeholder="Last Name"
                      value={labData.nom}
                      onChange={handleLabDataChange}
                    />
                    <input
                      type="text"
                      name="entreprise"
                      placeholder="Company"
                      value={labData.entreprise}
                      onChange={handleLabDataChange}
                    />
                    <input
                      type="url"
                      name="siteWeb"
                      placeholder="Website"
                      value={labData.siteWeb}
                      onChange={handleLabDataChange}
                    />
                    <input
                      type="url"
                      name="linkedin"
                      placeholder="LinkedIn Profile"
                      value={labData.linkedin}
                      onChange={handleLabDataChange}
                    />
                  </div>

                  <div className="lab-actions">
                    <button className="btn lab-btn" onClick={handleIngest} disabled={labLoading}>
                      {labLoading ? "⏳ Fetching..." : "📥 Fetch Visuals"}
                    </button>
                  </div>

                  <div className="lab-post-section">
                    <h4>📝 Analyze a Post</h4>
                    <textarea
                      placeholder="Paste the LinkedIn post text here..."
                      value={labPostText}
                      onChange={(e) => setLabPostText(e.target.value)}
                      className="lab-post-textarea"
                    />
                    
                    
                    
                    <div className="lab-post-actions">
                      <button className="btn lab-btn" onClick={handleAnalyzePost} disabled={labLoading || !labPostText.trim()}>
                        {labLoading ? "⏳ Analyzing..." : "🔍 Analyze Post"}
                      </button>
                    
                      <button 
                        className="btn lab-btn" 
                        onClick={handleSelectOptimal} 
                        disabled={labLoading || !labPostText.trim()}
                        title="Sélection optimale : favorise les images utiles (photo, portrait, people, workspace) et pénalise les inutiles (logo, icon, UI, dashboard abstrait)"
                      >
                        {labLoading ? "⏳ Selecting..." : "🎯 Select Optimal"}
                      </button>
                    </div>
                  </div>

                  {labAnalysis && (
                    <div className="lab-analysis">
                      <h4>📊 Post Analysis</h4>
                      <div className="analysis-content">
                        <p><strong>Themes:</strong> {labAnalysis.themes?.join(", ") || "N/A"}</p>
                        <p><strong>Tone:</strong> {labAnalysis.tone || "N/A"}</p>
                        <p><strong>Desired Tags:</strong> {labAnalysis.desiredTags?.join(", ") || "N/A"}</p>
                      </div>
                    </div>
                  )}

                  {labTop3Images && labTop3Images.length > 0 && (
                    <div className="lab-top3-section">
                      <h4>🏆Top {labTop3Images.length} Recommended Images ({labTop3Images.length})</h4>
                      <div className="lab-gallery-carousel">
                        <div className="lab-gallery-navigation">
                          <button
                            className="lab-nav-btn lab-nav-prev"
                            onClick={() => setLabTop3CurrentIndex((prev) => (prev > 0 ? prev - 1 : labTop3Images.length - 1))}
                            disabled={labTop3Images.length <= 1}
                            title="Previous image"
                          >
                            ←
                          </button>
                          <div className="lab-gallery-counter">
                            {labTop3CurrentIndex + 1} / {labTop3Images.length}
                          </div>
                          <button
                            className="lab-nav-btn lab-nav-next"
                            onClick={() => setLabTop3CurrentIndex((prev) => (prev < labTop3Images.length - 1 ? prev + 1 : 0))}
                            disabled={labTop3Images.length <= 1}
                            title="Next image"
                          >
                            →
                          </button>
                        </div>
                        <div className="lab-gallery-item-container">
                          <div key={labTop3Images[labTop3CurrentIndex].id || labTop3CurrentIndex} className="lab-gallery-item" style={{
                            border: labSelectedImage?.id === labTop3Images[labTop3CurrentIndex].id ? "3px solid #4caf50" : "none"
                          }}>
                            <div style={{ position: "absolute", top: "10px", left: "10px", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", fontWeight: "bold", fontSize: "14px", padding: "6px 10px", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>
                              {labTop3Images[labTop3CurrentIndex].rank || labTop3CurrentIndex + 1}
                            </div>
                            <img
                              src={labTop3Images[labTop3CurrentIndex].url}
                              alt={`Recommended image ${labTop3CurrentIndex + 1}`}
                              className="lab-gallery-img"
                            />
                            <div className="lab-image-info">
                              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                                <button
                                  className="btn lab-btn"
                                  onClick={() => handleSaveSelectedImage(labTop3Images[labTop3CurrentIndex].id)}
                                  style={{ 
                                    flex: 1,
                                    background: labSelectedImage?.id === labTop3Images[labTop3CurrentIndex].id ? "#4caf50" : "#667eea"
                                  }}
                                >
                                  {labSelectedImage?.id === labTop3Images[labTop3CurrentIndex].id ? "✅ Saved" : "💾 Save"}
                                </button>
                                <button
                                  className="btn lab-btn"
                                  onClick={() => {
                                    const currentImage = labTop3Images[labTop3CurrentIndex];
                                    if (currentImage && currentImage.url) {
                                      handleDownloadImage(currentImage.url, currentImage.id || currentImage.rank || labTop3CurrentIndex);
                                    } else {
                                      alert("Image not available for download.");
                                    }
                                  }}
                                  style={{ 
                                    flex: 1,
                                    background: "#2196F3"
                                  }}
                                >
                                  ⬇️ Download
                                </button>
                              </div>
                              
                              {labTop3Images[labTop3CurrentIndex].reasons && labTop3Images[labTop3CurrentIndex].reasons.length > 0 && (
                                <div style={{ marginBottom: "10px", padding: "8px", background: "#e3f2fd", borderRadius: "6px" }}>
                                  <p style={{ fontSize: "11px", color: "#555", fontStyle: "italic", lineHeight: "1.4", margin: 0 }}>
                                    💬 <strong>Raisons de sélection:</strong> {labTop3Images[labTop3CurrentIndex].reasons.join(", ")}
                                  </p>
                                </div>
                              )}
                              
                              <p className="lab-image-source">
                                <strong>Source:</strong> {labTop3Images[labTop3CurrentIndex].source || "N/A"}
                              </p>
                              
                              {/* Métadonnées compactes : Score, p, s */}
                              <div style={{ 
                                margin: "8px 0", 
                                padding: "8px", 
                                background: "#f5f5f5", 
                                borderRadius: "6px",
                                fontSize: "11px",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                                alignItems: "center"
                              }}>
                                <span style={{ fontWeight: "bold", color: "#667eea" }}>
                                  📊 Score: <span style={{ color: "#333" }}>{labTop3Images[labTop3CurrentIndex].score?.toFixed(2) || "N/A"}</span>
                                </span>
                                <span style={{ fontWeight: "bold", color: "#2196F3" }}>
                                  👥 p: <span style={{ color: "#333" }}>{labTop3Images[labTop3CurrentIndex].p ?? "N/A"}</span>
                                </span>
                                <span style={{ fontWeight: "bold", color: "#4caf50" }}>
                                  🎨 s: <span style={{ color: "#333" }}>{labTop3Images[labTop3CurrentIndex].s || "N/A"}</span>
                                </span>
                              </div>
                              
                              {/* Tags correspondants */}
                              {((labTop3Images[labTop3CurrentIndex].matched_tags && labTop3Images[labTop3CurrentIndex].matched_tags.length > 0) || 
                                (labTop3Images[labTop3CurrentIndex].tags && labTop3Images[labTop3CurrentIndex].tags.length > 0)) && (
                                <div className="lab-image-tags" style={{ marginTop: "8px" }}>
                                  <strong style={{ fontSize: "11px", display: "block", marginBottom: "5px", color: "#555" }}>
                                    🏷️ Tags correspondants ({labTop3Images[labTop3CurrentIndex].matched_tags?.length || labTop3Images[labTop3CurrentIndex].tags?.length || 0}):
                                  </strong>
                                  <div className="tags-list">
                                    {(labTop3Images[labTop3CurrentIndex].matched_tags || labTop3Images[labTop3CurrentIndex].tags || []).map((tag, tagIndex) => (
                                      <span key={tagIndex} className="tag-badge" title={tag} style={{ 
                                        background: "#e3f2fd", 
                                        color: "#1976d2",
                                        padding: "3px 8px",
                                        borderRadius: "12px",
                                        fontSize: "10px",
                                        fontWeight: "500"
                                      }}>
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {labTop3Images[labTop3CurrentIndex].context && (
                                <div className="lab-image-context">
                                  <strong>Context:</strong>
                                  {typeof labTop3Images[labTop3CurrentIndex].context === "object" ? (
                                    <div style={{ marginTop: "5px", fontSize: "11px" }}>
                                      {Object.entries(labTop3Images[labTop3CurrentIndex].context).map(([key, value]) => (
                                        <div key={key} style={{ marginTop: "3px" }}>
                                          <strong>{key}:</strong> {String(value)}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span> {labTop3Images[labTop3CurrentIndex].context}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {labSelectedImage && (
                    <div className="lab-selected" style={{ marginTop: "20px" }}>
                      <h4>✅ Selected and Saved Image</h4>
                      <img src={labSelectedImage.url} alt="Selected" className="lab-selected-img" />
                      <div className="lab-selected-info" style={{ marginTop: "15px", padding: "10px", background: "#f9f9f9", borderRadius: "8px" }}>
                        {labSelectedImage.score && (
                          <p style={{ fontSize: "12px", marginBottom: "8px" }}>
                            <strong>Relevance Score:</strong> {labSelectedImage.score}
                          </p>
                        )}
                        {labSelectedImage.source && (
                          <p style={{ fontSize: "12px", marginBottom: "8px" }}>
                            <strong>Source:</strong> {labSelectedImage.source}
                          </p>
                        )}
                        {labSelectedImage.tags && labSelectedImage.tags.length > 0 && (
                          <div style={{ marginTop: "8px" }}>
                            <strong style={{ fontSize: "12px", display: "block", marginBottom: "5px" }}>Tags:</strong>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {labSelectedImage.tags.slice(0, 10).map((tag, tagIndex) => (
                                <span key={tagIndex} className="tag-badge-small">{tag}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <h3>📤 {flowType === "auto" ? "Upload your selfies (max 2)" : "Upload your photos (max 10)"}</h3>

              <button className="btn" onClick={() => document.getElementById("galleryInput").click()}>
                🖼️ Choose from gallery
              </button>
              <input
                id="galleryInput"
                type="file"
                multiple
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleUpload}
              />

              <button className="btn" onClick={() => document.getElementById("cameraInput").click()}>
                📸 Take a photo
              </button>
              <input
                id="cameraInput"
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: "none" }}
                onChange={handleUpload}
              />

              <p>{photos.length} / {flowType === "auto" ? "2 selfies" : "10 photos"} uploaded</p>

              <div className="preview-grid">
                {photos.map((file, index) => (
                  <div key={index} className="preview-item">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Uploaded ${index}`}
                      className="preview-img"
                    />
                    <button className="remove-btn" onClick={() => handleDeletePhoto(index)}>
                      ❌
                    </button>
                  </div>
                ))}
              </div>

              <div className="style-select">
                <h4>🎨 Choose a style <span style={{fontSize: '12px', color: '#666', fontWeight: 'normal'}}>(39 styles available)</span></h4>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  disabled={flowType === "auto"}
                  style={{width: '100%', maxWidth: '500px', minHeight: '40px'}}
                >
                  <option value="professional_indoor">Professional indoor portrait</option>
                  <option value="professional_outdoor">Professional outdoor portrait</option>
                  <option value="corporate_studio">Corporate studio portrait</option>
                  <option value="modern_workspace">Portrait in modern workspace</option>
                  <option value="personal_office">Portrait in personal office</option>
                  <option value="street">Street portrait (urban)</option>
                  <option value="working_computer">Person working on computer</option>
                  <option value="writing_notes">Person writing or taking notes</option>
                  <option value="presenting_screen">Person presenting on screen</option>
                  <option value="meeting">Person in meeting</option>
                  <option value="podcast">Person in podcast</option>
                  <option value="conference">Person at conference</option>
                  <option value="walking_street">Person walking on street</option>
                  <option value="selfie_train">Selfie in train</option>
                  <option value="selfie_car">Selfie in car</option>
                  <option value="selfie_other_transport">Selfie in other transport</option>
                  <option value="selfie_office">Selfie at desk</option>
                  <option value="selfie_outdoor">Selfie outdoors (nature)</option>
                  <option value="selfie_street">Selfie outdoors (street/urban)</option>
                  <option value="selfie_gesture">Selfie with simple gesture</option>
                  <option value="selfie_pointing">Selfie pointing at something</option>
                  <option value="coffee_break">Person drinking coffee</option>
                  <option value="drinking_other">Person drinking other beverage</option>
                  <option value="eating_meal">Person eating simple meal</option>
                  <option value="software_interface">Software interface on computer screen</option>
                  <option value="software_interface_smartphone">Software interface on smartphone</option>
                  <option value="app_screenshot">Application – stylized screenshot</option>
                  <option value="app_immersive">Application – immersive representation</option>
                  <option value="digital_product_computer">Digital product used on computer</option>
                  <option value="digital_product_smartphone">Digital product used on smartphone</option>
                  <option value="product_neutral">Physical product on neutral background</option>
                  <option value="product_office">Physical product in office</option>
                  <option value="product_indoor">Physical product indoors</option>
                  <option value="product_outdoor">Physical product outdoors</option>
                  <option value="product_person_blurred">Physical product in use (blurred person)</option>
                  <option value="mentor_portrait">Mentor portrait</option>
                  <option value="leader_portrait">Leader portrait</option>
                  <option value="creative_portrait">Creative portrait</option>
                  <option value="subtle_humor">Subtle humorous scene</option>
                </select>

                {flowType === "auto" && (
                  <p className="disabled-hint">Style is disabled in auto-prompt mode.</p>
                )}
              </div>

              {flowType === "auto" && (
                <div className="post-text-block">
                  <h4>📝 Post Text</h4>

                  <div className="post-input-toggle">
                    <button
                      type="button"
                      className={postInputMode === "select" ? "active" : ""}
                      onClick={() => {
                        setPostInputMode("select");
                      }}
                    >
                      📋 Choose a predefined post
                    </button>
                    <button
                      type="button"
                      className={postInputMode === "manual" ? "active" : ""}
                      onClick={() => {
                        setPostInputMode("manual");
                      }}
                    >
                      ✏️ Enter manually
                    </button>
                  </div>

                  {postInputMode === "select" && (
                    <select
                      value=""
                      onChange={(e) => {
                        const selectedPost = predefinedPosts.find((p) => p.id === e.target.value);
                        if (selectedPost) {
                          setPostText(selectedPost.text);
                        }
                      }}
                      className="post-select"
                    >
                      <option value="">-- Select a test post --</option>
                      {predefinedPosts.map((post) => (
                        <option key={post.id} value={post.id}>
                          {post.title}
                        </option>
                      ))}
                    </select>
                  )}

                  <textarea
                    placeholder={
                      postInputMode === "select"
                        ? "Select a post above or switch to manual mode to write..."
                        : "Describe the LinkedIn / Instagram post..."
                    }
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    className={postInputMode === "select" && postText ? "selected-post-textarea" : ""}
                  ></textarea>

                  <p className="hint">Add 1 to 2 selfies for a personalized prompt.</p>
                </div>
              )}

              <div className="images-count">
                <h4>🖼️ Nombre d'images</h4>
                <select
                  value={flowType === "auto" ? 2 : numberOfImages}
                  onChange={(e) => setNumberOfImages(Math.min(Math.max(parseInt(e.target.value, 10), 1), 4))}
                  disabled={flowType === "auto"}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>

                {flowType === "auto" && (
                  <p className="hint">Auto-prompt : 2 images générées, 1 à 2 selfies max.</p>
                )}
              </div>

              <button className="btn generate" onClick={handleGenerate} disabled={loading}>
                {loading ? "Generating..." : "🎨 Generate my image"}
              </button>

              {loading && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                  <p className="progress-text">{progress}%</p>
                </div>
              )}
                </>
              )}
            </div>

            {/* Right side */}
            <div className="gallery">
              {flowType === "lab" ? (
                <>
                  <h3>🖼️ Lab Gallery ({labImages.length} visual(s))</h3>
                  {labImages.length > 0 ? (
                    <div className="lab-gallery-carousel">
                      <div className="lab-gallery-navigation">
                        <button
                          className="lab-nav-btn lab-nav-prev"
                          onClick={() => setLabCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : labImages.length - 1))}
                          disabled={labImages.length <= 1}
                          title="Previous image"
                        >
                          ←
                        </button>
                        <div className="lab-gallery-counter">
                          {labCurrentImageIndex + 1} / {labImages.length}
                        </div>
                        <button
                          className="lab-nav-btn lab-nav-next"
                          onClick={() => setLabCurrentImageIndex((prev) => (prev < labImages.length - 1 ? prev + 1 : 0))}
                          disabled={labImages.length <= 1}
                          title="Next image"
                        >
                          →
                        </button>
                      </div>
                      <div className="lab-gallery-item-container">
                        <div key={labImages[labCurrentImageIndex].id || labCurrentImageIndex} className="lab-gallery-item">
                          <img
                            src={labImages[labCurrentImageIndex].url}
                            alt={`Lab image ${labCurrentImageIndex + 1}`}
                            className="lab-gallery-img"
                          />
                          <div className="lab-image-info">
                            {/* Schéma JSON conforme */}
                            <div style={{ marginTop: "10px", padding: "10px", background: "#f5f5f5", borderRadius: "8px", fontFamily: "monospace", fontSize: "12px" }}>
                              <strong style={{ display: "block", marginBottom: "8px", color: "#333" }}>Schéma JSON:</strong>
                              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
{JSON.stringify({
  id: labImages[labCurrentImageIndex].id || labImages[labCurrentImageIndex].u?.split('/').pop() || "N/A",
  u: labImages[labCurrentImageIndex].u || labImages[labCurrentImageIndex].url || "N/A",
  t: labImages[labCurrentImageIndex].t || labImages[labCurrentImageIndex].tags || [],
  p: labImages[labCurrentImageIndex].p ?? labImages[labCurrentImageIndex].context?.p ?? 1,
  s: labImages[labCurrentImageIndex].s || labImages[labCurrentImageIndex].context?.s || "photo",
  x: labImages[labCurrentImageIndex].x || labImages[labCurrentImageIndex].context?.x || [],
  d: labImages[labCurrentImageIndex].d || labImages[labCurrentImageIndex].context?.d || "Image visuelle professionnelle."
}, null, 2)}
                              </pre>
                            </div>
                            
                            {/* Métadonnées supplémentaires (optionnel) */}
                            <div style={{ marginTop: "10px", fontSize: "11px", color: "#666" }}>
                              {labImages[labCurrentImageIndex].source && (
                                <p style={{ margin: "3px 0" }}>
                                  <strong>Source:</strong> {labImages[labCurrentImageIndex].source}
                                </p>
                              )}
                              {labImages[labCurrentImageIndex].created_at && (
                                <p style={{ margin: "3px 0" }}>
                                  <strong>Date:</strong> {(() => {
                                    const date = labImages[labCurrentImageIndex].created_at;
                                    let dateObj;
                                    if (date?.seconds) {
                                      dateObj = new Date(date.seconds * 1000);
                                    } else if (date?.toDate) {
                                      dateObj = date.toDate();
                                    } else {
                                      dateObj = new Date(date);
                                    }
                                    return dateObj.toLocaleDateString('fr-FR', { 
                                      year: 'numeric', 
                                      month: 'long', 
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    });
                                  })()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="lab-empty-message">
                      <p style={{ fontSize: "16px", marginBottom: "10px", fontWeight: "bold" }}>
                        Aucun visuel récupéré
                      </p>
                      <p style={{ fontSize: "14px", color: "#666" }}>
                        Veuillez d'abord lancer le fetching des visuels en cliquant sur le bouton "Fetch Visuals" ci-dessus.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h3>🖼️ Generated Images ({selectedImageIndex !== null ? 1 : images.length})</h3>

              <div className="gallery-grid">
                {selectedImageIndex !== null ? (
                  <div className="image-wrapper">
                    <img
                      key={selectedImageIndex}
                      src={images[selectedImageIndex]}
                      alt={`Selected ${selectedImageIndex + 1}`}
                      className="gallery-img selected"
                      onClick={() => setSelectedImageIndex(null)}
                      title="Click to show all images again"
                      onError={(e) => {
                        e.target.style.display = "none";
                        console.error("Image failed to load:", images[selectedImageIndex]?.substring(0, 50));
                      }}
                    />
                    <button
                      className="download-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadImage(images[selectedImageIndex], selectedImageIndex);
                      }}
                      title="Download this image"
                    >
                      
                    </button>
                  </div>
                ) : (
                  images.map((img, index) => (
                    <div key={index} className="image-wrapper">
                      <img
                        src={img}
                        alt={`Generated ${index + 1}`}
                        className="gallery-img clickable"
                        onClick={() => handleSelectImage(index)}
                        title="Click to select this image"
                        onError={(e) => {
                          e.target.style.display = "none";
                          console.error(`Image ${index + 1} failed to load:`, img?.substring(0, 50));
                        }}
                      />
                      <button
                        className="download-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadImage(img, index);
                        }}
                        title="Download this image"
                      >
                        ⬇️ Download
                      </button>
                    </div>
                  ))
                )}

                {images.length === 0 && !loading && (
                  <p>No images generated yet. Upload photos and click generate!</p>
                )}
              </div>

              {selectedImageIndex !== null && images.length > 1 && (
                <p className="selection-hint">✓ Image selected! Click on it to show all images again.</p>
              )}

              {images.length > 0 && (
                <div className="gallery-actions">
                  <button className="btn generate" onClick={handleGenerate} disabled={loading}>
                    🔄 Régénérer
                  </button>

                  <button
                    className="btn save-btn"
                    onClick={handleSaveSelection}
                    disabled={selectedImageIndex === null || loading}
                  >
                    💾 Save selected image
                  </button>

                  <button
                    className="btn download-all-btn"
                    onClick={handleDownloadAll}
                    disabled={loading}
                  >
                    ⬇️ Download all images
                  </button>
                </div>
              )}
                </>
              )}
            </div>
          </div>

          <div className="bottom-actions">
            <button className="btn delete" onClick={handleDeleteAll}>
              🗑️ Delete my profile
            </button>
            <button className="btn logout" onClick={handleLogout}>
              🚪 Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
