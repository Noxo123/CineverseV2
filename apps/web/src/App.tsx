import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowLeft, ArrowRight, Bell, Check, ChevronDown, CircleHelp,
  Clapperboard, Clock3, Command, CreditCard, Film, Gauge, Globe2, KeyRound,
  LayoutDashboard, LifeBuoy, LockKeyhole, LogIn, Mail, Menu, MonitorPlay,
  MoreHorizontal, Pencil, Play, Plus, Search, Settings, Shield, ShieldCheck,
  Sparkles, Ticket, Tv, Upload, Users, Video, X, Zap
} from "lucide-react";

type Screen = "home" | "login" | "register" | "profiles" | "profile-edit" | "catalog";
type Profile = { id: number; name: string; color: string; initials: string; online: boolean; child: boolean };
type AdminSection = "overview" | "catalog" | "vip" | "ads" | "apis" | "monitoring" | "users" | "settings";

const initialProfiles: Profile[] = [
  { id: 1, name: "Noxo", color: "coral", initials: "N", online: true, child: false },
  { id: 2, name: "Invité", color: "blue", initials: "I", online: false, child: false },
  { id: 3, name: "Kids", color: "mint", initials: "K", online: false, child: true }
];

const adminItems: { id: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { id: "catalog", label: "Catalogue & imports", icon: Film },
  { id: "vip", label: "VIP & abonnements", icon: Ticket },
  { id: "ads", label: "Publicités", icon: Video },
  { id: "apis", label: "APIs & fournisseurs", icon: Globe2 },
  { id: "monitoring", label: "État & performances", icon: Activity },
  { id: "users", label: "Utilisateurs", icon: Users },
  { id: "settings", label: "Configuration", icon: Settings }
];

const films = [
  { title: "Les derniers horizons", genre: "Science-fiction", year: "2026", color: "poster-one", tag: "À LA UNE" },
  { title: "La dernière lumière", genre: "Thriller", year: "2025", color: "poster-two", tag: "TENDANCE" },
  { title: "Au-delà du silence", genre: "Drame", year: "2026", color: "poster-three", tag: "NOUVEAU" },
  { title: "Minuit à Paris", genre: "Mystère", year: "2024", color: "poster-four", tag: "CULTE" }
];

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-mark"><Clapperboard size={compact ? 17 : 21} /></span>{!compact && <span>CINE<span>VERSE</span></span>}</div>;
}

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
  const [profiles, setProfiles] = useState(initialProfiles);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileChild, setProfileChild] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);

  const filteredFilms = useMemo(() => films.filter(f => (f.title + f.genre).toLowerCase().includes(query.toLowerCase())), [query]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3600);
  };

  const openEditor = (profile?: Profile) => {
    setEditing(profile ?? null);
    setProfileName(profile?.name ?? "");
    setProfileChild(profile?.child ?? false);
    setScreen("profile-edit");
  };

  const saveProfile = () => {
    if (!profileName.trim()) return notify("Choisis un nom pour ce profil.");
    if (editing) {
      setProfiles(current => current.map(p => p.id === editing.id ? { ...p, name: profileName.trim(), child: profileChild, initials: profileName.trim().slice(0, 1).toUpperCase() } : p));
    } else {
      if (profiles.length >= 5) return notify("Tu as atteint la limite de 5 profils.");
      const colors = ["coral", "blue", "mint", "violet", "amber"];
      setProfiles(current => [...current, { id: Date.now(), name: profileName.trim(), color: colors[current.length % colors.length], initials: profileName.trim().slice(0, 1).toUpperCase(), online: false, child: profileChild }]);
    }
    setScreen("profiles");
    notify("Profil enregistré dans cet aperçu.");
  };

  const submitAuth = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    notify("L'interface est prête. Le service sécurisé de compte sera connecté dans le prochain lot.");
  };

  const chooseProfile = (profile: Profile) => {
    setActiveProfile(profile);
    setScreen("catalog");
    notify("Profil sélectionné : " + profile.name);
  };

  const adminLabel = adminItems.find(i => i.id === adminSection)?.label ?? "Administration";

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" /><div className="ambient ambient-b" />
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setMobileMenu(v => !v)} aria-label="Menu"><Menu /></button>
        <button className="brand-button" onClick={() => { setScreen("home"); setAdminOpen(false); }}><Brand /></button>
        <nav className={mobileMenu ? "main-nav nav-open" : "main-nav"}>
          <button className={screen === "home" ? "nav-link active" : "nav-link"} onClick={() => { setScreen("home"); setAdminOpen(false); }}>Découvrir</button>
          <button className={screen === "catalog" ? "nav-link active" : "nav-link"} onClick={() => { setScreen("catalog"); setAdminOpen(false); }}>Films & séries</button>
          <button className="nav-link" onClick={() => notify("La Watch Party arrive dans un prochain module.")}>Watch Party</button>
          <button className="nav-link" onClick={() => notify("La communauté arrive dans un prochain module.")}>Communauté</button>
        </nav>
        <div className="top-actions">
          <button className="icon-button search-trigger" onClick={() => setScreen("catalog")} aria-label="Rechercher"><Search size={19} /></button>
          {activeProfile ? <button className="mini-profile" onClick={() => setScreen("profiles")}><span className={"avatar avatar-" + activeProfile.color}>{activeProfile.initials}</span><ChevronDown size={14} /></button> : <><button className="login-link" onClick={() => setScreen("login")}>Connexion</button><button className="button button-small" onClick={() => setScreen("register")}>S'inscrire</button></>}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {adminOpen ? (
          <motion.main key="admin" className="admin-layout page-wrap" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <aside className="admin-sidebar">
              <div className="admin-side-heading"><span className="eyebrow">CINEVERSE CONTROL</span><strong>Centre d'administration</strong></div>
              {adminItems.map(item => <button key={item.id} className={adminSection === item.id ? "admin-nav active" : "admin-nav"} onClick={() => setAdminSection(item.id)}><item.icon size={17} />{item.label}{item.id === "monitoring" && <i className="status-dot" />}</button>)}
              <div className="admin-side-bottom"><ShieldCheck size={17} /><span>Accès administrateur</span><small>RBAC côté serveur requis</small></div>
            </aside>
            <section className="admin-content">
              <div className="admin-heading"><div><span className="eyebrow">ESPACE PRIVILÉGIÉ / {adminLabel.toUpperCase()}</span><h1>{adminLabel}</h1><p>Supervision et pilotage de la plateforme Cineverse.</p></div><button className="button button-ghost" onClick={() => setAdminOpen(false)}>Quitter l'administration <X size={15} /></button></div>
              {adminSection === "overview" && <><div className="metric-grid">{[{label:"Comptes",value:"—",sub:"En attente de connexion DB",icon:Users},{label:"Films publiés",value:"—",sub:"Catalogue non connecté",icon:Film},{label:"Abonnements VIP",value:"—",sub:"Paiements non connectés",icon:Ticket},{label:"Disponibilité",value:"—",sub:"Monitoring à brancher",icon:Activity}].map(m => <div className="metric-card" key={m.label}><div className="metric-top"><span>{m.label}</span><m.icon size={18} /></div><strong>{m.value}</strong><small>{m.sub}</small></div>)}</div><div className="admin-panels"><div className="panel-card"><div className="panel-title"><div><span className="eyebrow">SYSTÈME</span><h3>État des services</h3></div><span className="pill pill-muted">Non connecté</span></div>{["API principale","Base de données","Stockage média","Passerelle temps réel","Service de paiement"].map(s => <div className="service-row" key={s}><span>{s}</span><span className="service-wait">En attente de configuration</span></div>)}</div><div className="panel-card"><span className="eyebrow">ACTIVITÉ RÉCENTE</span><h3>Journal système</h3><div className="empty-state compact"><Activity size={24} /><strong>Aucun événement réel</strong><p>Les journaux apparaîtront après connexion de l'API.</p></div></div></div></>}
              {adminSection === "catalog" && <div className="panel-card"><div className="panel-title"><div><span className="eyebrow">GESTION DES MÉDIAS</span><h3>Importer des films et séries</h3></div><span className="pill pill-muted">Module UI</span></div><div className="dropzone"><Upload size={30} /><strong>Déposer un fichier ou sélectionner un média</strong><p>CSV, JSON ou import depuis une API de métadonnées. Les droits de diffusion devront être vérifiés séparément.</p><button className="button button-secondary" onClick={() => notify("L'import sera activé avec le backend catalogue.")}>Choisir un fichier</button></div><div className="form-grid"><label>Source de métadonnées<input placeholder="Ex. TMDB (clé serveur)" /></label><label>Type de contenu<select defaultValue="movie"><option value="movie">Films</option><option value="tv">Séries</option></select></label></div></div>}
              {adminSection === "vip" && <div className="panel-card"><span className="eyebrow">MONÉTISATION</span><h3>Gestion VIP</h3><p className="muted">Gestion des offres, abonnements, renouvellements, remboursements et avantages. Aucune transaction réelle n'est branchée.</p><div className="empty-state"><Ticket size={28} /><strong>Connecter le service de paiement</strong><p>Les droits VIP seront accordés uniquement après confirmation serveur du paiement.</p></div></div>}
              {adminSection === "ads" && <div className="panel-card"><span className="eyebrow">REVENUS PUBLICITAIRES</span><h3>Campagnes publicitaires</h3><div className="form-grid"><label>Nom de campagne<input placeholder="Nom interne" /></label><label>Emplacement<select><option>Accueil</option><option>Avant lecture</option><option>Bannière catalogue</option></select></label><label>Début<input type="date" /></label><label>Fin<input type="date" /></label></div><button className="button" onClick={() => notify("La création de campagne sera reliée au backend.")}>Créer une campagne</button><p className="muted tiny">Les campagnes seront soumises à des règles de fréquence, consentement et mesure.</p></div>}
              {adminSection === "apis" && <div className="panel-card"><span className="eyebrow">INTÉGRATIONS</span><h3>APIs & fournisseurs</h3>{["TMDB — métadonnées","Discord — authentification et communauté","Stripe — abonnements","Stockage — affiches et médias","Fournisseurs de lecture autorisés"].map((s,i)=><div className="service-row" key={s}><span>{s}</span><span className="service-wait">{i===0?"À configurer":"Non connecté"}</span></div>)}<p className="muted tiny">Les clés privées restent côté serveur. Aucun fournisseur vidéo ne sera activé sans validation des droits.</p></div>}
              {adminSection === "monitoring" && <div className="panel-card"><span className="eyebrow">OBSERVABILITÉ</span><h3>État du site & latence</h3><div className="metric-grid monitoring-grid">{["Disponibilité","Latence API","Temps DB","Erreurs 5xx"].map(s=><div className="metric-card" key={s}><span>{s}</span><strong>—</strong><small>Mesures réelles indisponibles</small></div>)}</div><div className="empty-state"><Gauge size={30}/><strong>Instrumentation à connecter</strong><p>Health checks, p50/p95/p99, uptime, taux d'erreur, CPU, mémoire et alertes seront mesurés côté serveur.</p></div></div>}
              {adminSection === "users" && <div className="panel-card"><span className="eyebrow">COMPTES & MODÉRATION</span><h3>Utilisateurs</h3><div className="empty-state"><Users size={28}/><strong>Base utilisateurs non connectée</strong><p>Recherche, suspension, rôles, sessions, historique de sécurité et gestion des profils.</p></div></div>}
              {adminSection === "settings" && <div className="panel-card"><span className="eyebrow">CONFIGURATION GLOBALE</span><h3>Paramètres de la plateforme</h3><div className="form-grid"><label>Nom du site<input defaultValue="Cineverse" /></label><label>Mode du site<select><option>Développement</option><option>Maintenance</option><option>Production</option></select></label><label>Origine publique<input defaultValue="https://cineverse.fun" /></label><label>Fuseau horaire<input defaultValue="Europe/Paris" /></label></div><button className="button" onClick={() => notify("Les paramètres seront sauvegardés par l'API d'administration.")}>Enregistrer</button></div>}
            </section>
          </motion.main>
        ) : (
          <motion.main key={screen} className="page-wrap" initial={{ opacity: 0, y: 13 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -9 }} transition={{ duration: .24 }}>
            {screen === "home" && <><section className="hero"><div className="hero-copy"><span className="eyebrow"><Sparkles size={13}/> LE CINÉMA EN UN SEUL UNIVERS</span><h1>Chaque histoire<br/>mérite <em>son univers.</em></h1><p>Explore des mondes, retrouve tes films préférés et crée ton espace cinéma. Une nouvelle expérience pensée autour de toi.</p><div className="hero-actions"><button className="button" onClick={() => setScreen("register")}>Commencer l'expérience <ArrowRight size={17}/></button><button className="button button-ghost" onClick={() => setScreen("catalog")}><Play size={16}/> Explorer le catalogue</button></div><div className="hero-proof"><span><ShieldCheck size={15}/> Profils personnalisés</span><span><Tv size={15}/> Multi-écrans</span><span><Zap size={15}/> Expérience fluide</span></div></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-poster poster-main"><span className="poster-kicker">UNE NOUVELLE ÈRE</span><strong>BEYOND<br/>THE STARS</strong><small>UNE HISTOIRE SANS FRONTIÈRE</small></div><div className="floating-chip chip-top"><Sparkles size={14}/> Ton cinéma, ton univers</div><div className="floating-chip chip-bottom"><Play size={13} fill="currentColor"/> Reprendre l'aventure</div></div></section><section className="section-block"><div className="section-heading"><div><span className="eyebrow">SÉLECTION CINEVERSE</span><h2>Des histoires à découvrir</h2></div><button className="text-link" onClick={() => setScreen("catalog")}>Tout explorer <ArrowRight size={15}/></button></div><div className="movie-grid">{films.map((f,i)=><button className="movie-card" key={f.title} onClick={() => notify("Le catalogue réel sera connecté à l'API.")}><div className={"movie-poster "+f.color}><span className="movie-tag">{f.tag}</span><span className="movie-number">0{i+1}</span><span className="movie-poster-title">{f.title}</span><span className="movie-play"><Play size={18} fill="currentColor"/></span></div><div className="movie-meta"><strong>{f.title}</strong><span>{f.genre} · {f.year}</span></div></button>)}</div></section><section className="feature-strip"><div><span className="eyebrow">UNE EXPÉRIENCE QUI TE RESSEMBLE</span><h2>Ton univers. Tes profils.<br/><em>Tes règles.</em></h2><p>Jusqu'à cinq espaces personnalisés pour que chacun retrouve ses recommandations, sa progression et ses envies.</p><button className="button button-secondary" onClick={() => setScreen("profiles")}>Découvrir les profils <ArrowRight size={16}/></button></div><div className="feature-profiles">{profiles.slice(0,3).map(p=><div className="feature-profile" key={p.id}><span className={"avatar avatar-large avatar-"+p.color}>{p.initials}</span><span>{p.name}</span><i className={p.online?"online-dot":""}/></div>)}</div></section></>}
            {(screen === "login" || screen === "register") && <section className="auth-layout"><div className="auth-visual"><div className="auth-glow"/><span className="eyebrow">BIENVENUE DANS TON UNIVERS</span><h1>{screen === "login" ? "Heureux de te retrouver." : "Ton prochain chapitre commence ici."}</h1><p>Retrouve ton espace, tes profils et toutes tes découvertes au même endroit.</p><div className="auth-quote"><Clapperboard size={21}/><span>« Le meilleur siège est celui où commence ton histoire. »</span></div></div><div className="auth-card"><button className="back-link" onClick={() => setScreen("home")}><ArrowLeft size={15}/> Retour à l'accueil</button><div className="auth-card-head"><Brand/><span className="eyebrow">{screen === "login" ? "TON ESPACE T'ATTEND" : "REJOINS CINEVERSE"}</span><h2>{screen === "login" ? "Connexion" : "Créer un compte"}</h2><p>{screen === "login" ? "Connecte-toi pour retrouver ton cinéma." : "Quelques instants pour créer ton univers."}</p></div><form onSubmit={submitAuth}><label>Adresse e-mail<div className="input-wrap"><Mail size={17}/><input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="nom@exemple.com" required/></div></label><label>Mot de passe<div className="input-wrap"><LockKeyhole size={17}/><input type={showPassword?"text":"password"} value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="8 caractères minimum" minLength={8} required/><button type="button" className="show-password" onClick={()=>setShowPassword(v=>!v)}>{showPassword?"Masquer":"Voir"}</button></div></label>{screen === "register" && <label className="check-row"><input type="checkbox" required/> J'accepte les conditions d'utilisation et la politique de confidentialité.</label>}<button className="button auth-submit" type="submit">{screen === "login" ? "Se connecter" : "Créer mon compte"} <ArrowRight size={16}/></button></form><div className="auth-divider"><span/>ou<span/></div><button className="discord-button" onClick={() => notify("Connexion Discord : intégration OAuth à venir.")}><Command size={17}/> Continuer avec Discord</button><p className="auth-switch">{screen === "login" ? "Pas encore de compte ?" : "Tu as déjà un compte ?"} <button onClick={() => setScreen(screen === "login"?"register":"login")}>{screen === "login"?"Créer un compte":"Se connecter"}</button></p><p className="tiny muted auth-note">Aperçu de l'interface — aucun compte n'est créé tant que le backend d'authentification n'est pas raccordé.</p></div></section>}
            {screen === "profiles" && <section className="profiles-page"><button className="back-link" onClick={() => setScreen(activeProfile?"catalog":"home")}><ArrowLeft size={15}/> Retour</button><div className="profiles-title"><span className="eyebrow">UN COMPTE, PLUSIEURS UNIVERS</span><h1>Qui regarde <em>aujourd'hui ?</em></h1><p>Choisis ton profil pour retrouver ton expérience personnalisée.</p></div><div className="profiles-grid">{profiles.map(p=><motion.div key={p.id} className="profile-tile" whileHover={{ y:-7 }}><button className="profile-select" onClick={()=>chooseProfile(p)}><span className={"avatar avatar-xl avatar-"+p.color}>{p.initials}</span><strong>{p.name}</strong><span className="profile-state">{p.online?<><i className="online-dot"/> En ligne</>:"Hors ligne"}{p.child&&" · Enfant"}</span></button><button className="profile-edit" onClick={()=>openEditor(p)} aria-label={"Modifier "+p.name}><Pencil size={15}/></button></motion.div>)}{profiles.length<5&&<button className="add-profile" onClick={()=>openEditor()}><span><Plus size={28}/></span><strong>Ajouter un profil</strong><small>{5-profiles.length} emplacement{5-profiles.length>1?"s":""} disponible{5-profiles.length>1?"s":""}</small></button>}</div><button className="manage-profiles" onClick={()=>openEditor(profiles[0])}>Gérer les profils <ArrowRight size={15}/></button><p className="tiny muted">Les statuts en ligne affichés ici sont des exemples d'interface. La présence réelle nécessitera un heartbeat serveur et une synchronisation temps réel.</p></section>}
            {screen === "profile-edit" && <section className="edit-profile-page"><button className="back-link" onClick={()=>setScreen("profiles")}><ArrowLeft size={15}/> Retour aux profils</button><div className="edit-card"><span className="eyebrow">PERSONNALISATION</span><h1>{editing?"Modifier le profil":"Créer un profil"}</h1><p>Personnalise cet espace comme tu le souhaites.</p><div className="avatar-preview"><span className={"avatar avatar-xl avatar-"+(editing?.color??"coral")}>{profileName.trim().slice(0,1).toUpperCase()||"?"}</span></div><label>Nom du profil<input autoFocus maxLength={24} value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Ex. Alex"/></label><label className="check-row child-toggle"><input type="checkbox" checked={profileChild} onChange={e=>setProfileChild(e.target.checked)}/> Profil enfant <small>Prévoir des restrictions adaptées à l'âge.</small></label><div className="edit-actions"><button className="button button-ghost" onClick={()=>setScreen("profiles")}>Annuler</button><button className="button" onClick={saveProfile}>Enregistrer <Check size={16}/></button></div></div></section>}
            {screen === "catalog" && <section className="catalog-page"><div className="catalog-heading"><div><span className="eyebrow">TON ESPACE CINÉMA {activeProfile&&"· "+activeProfile.name.toUpperCase()}</span><h1>Explore <em>l'inattendu.</em></h1><p>Des films et des séries à retrouver dans ton prochain univers.</p></div><div className="catalog-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un titre ou un genre"/></div></div><div className="catalog-filters"><button className="filter-chip active">Tout</button><button className="filter-chip">Films</button><button className="filter-chip">Séries</button><button className="filter-chip">Tendances</button><button className="filter-chip">Nouveautés</button></div><div className="movie-grid">{filteredFilms.map((f,i)=><button className="movie-card" key={f.title} onClick={()=>notify("Fiche détaillée et lecture seront reliées au catalogue.")}><div className={"movie-poster "+f.color}><span className="movie-tag">{f.tag}</span><span className="movie-number">0{i+1}</span><span className="movie-poster-title">{f.title}</span><span className="movie-play"><Play size={18} fill="currentColor"/></span></div><div className="movie-meta"><strong>{f.title}</strong><span>{f.genre} · {f.year}</span></div></button>)}</div>{filteredFilms.length===0&&<div className="empty-state"><Search/><strong>Aucun résultat</strong><p>Essaie un autre titre ou un autre genre.</p></div>}</section>}
          </motion.main>
        )}
      </AnimatePresence>

      <footer className="footer"><div><Brand/><span>© 2026 Cineverse. Tous les univers, une seule destination.</span></div><div className="footer-links"><button onClick={()=>notify("Les mentions légales seront publiées avant ouverture.")}>Mentions légales</button><button onClick={()=>notify("Centre d'aide bientôt disponible.")}>Aide</button><button onClick={()=>setAdminOpen(true)}><Shield size={14}/> Administration</button></div></footer>
      <AnimatePresence>{notice&&<motion.div className="toast" initial={{opacity:0,y:15}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}}><Check size={16}/>{notice}</motion.div>}</AnimatePresence>
    </div>
  );
}

export default App;
