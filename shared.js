"use strict";
/* ============================================================================================
   NH-KURZSCHLUSSSTROMRECHNER -- shared.js
   Gemeinsame Utilities, Glossar/Info-Popover-System und Sicherungsdatensatz-Logik, die sowohl
   vom Rechner (index.html) als auch von der Sicherungsbibliothek (sicherungsbibliothek.html)
   verwendet werden. Beide Seiten teilen sich denselben localStorage-Schlüssel (STORAGE_KEY) --
   jede Seite lädt den vollständigen gespeicherten Zustand, verändert nur die für sie relevanten
   Felder und schreibt den gesamten Zustand beim Speichern unverändert zurück, damit auf der
   jeweils anderen Seite gepflegte Daten (Anlagentopologie bzw. Sicherungsbibliothek) erhalten
   bleiben.
   ============================================================================================ */
const APP_VERSION = "1.9.2";
const STORAGE_KEY = "nhrechner_state_v1";

function el(tag, attrs, children){
  const e = document.createElement(tag);
  if(attrs) for(const k in attrs){
    if(k==="text") e.textContent = attrs[k];
    else if(k==="html") e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if(children) children.forEach(c=>c && e.appendChild(c));
  return e;
}
function fmt(n, digits=2){
  if(n==null || !isFinite(n)) return "—";
  return n.toLocaleString("de-DE", { minimumFractionDigits:digits, maximumFractionDigits:digits });
}
function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href:url, download:filename });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

let ID_COUNTER = 0;
function neueId(prefix){ return prefix+"_"+Date.now().toString(36)+"_"+(ID_COUNTER++); }
function ensureFuseId(f){ if(!f.id) f.id = neueId("f"); return f; }
function clearFuseReferences(node, fuseId){
  if(node.fuseId===fuseId) node.fuseId=null;
  (node.kinder||[]).forEach(k=>clearFuseReferences(k, fuseId));
}
// ---- Glossar / Wiki: erklärt jeden Eingabe- und Ergebniswert des Tools. Wird sowohl als
// anklickbares ⓘ-Infofeld neben der jeweiligen Bezeichnung als auch als durchsuchbare
// Gesamtübersicht (Abschnitt "Glossar/Wiki") angezeigt. ------------------------------------
const GLOSSAR = {
  // Anlagendaten
  kunde: { titel:"Kunde", text:"Name des Auftraggebers/Kunden. Reine Dokumentationsangabe für Kopf und Protokoll, ohne Einfluss auf die Berechnung." },
  anlage: { titel:"Anlage", text:"Bezeichnung der Gesamtanlage bzw. des Gebäudes/der Liegenschaft, in der sich der betrachtete Stromkreis befindet." },
  anlagenteil: { titel:"Anlagenteil", text:"Bezeichnung des konkret betrachteten Anlagenteils, z. B. „Unterverteilung Keller“ oder „Werkstatt West“." },
  pruefer: { titel:"Prüfer / Elektrofachkraft", text:"Name der Elektrofachkraft, die die Berechnung durchführt. Die Verantwortung für Auslegung und Bewertung verbleibt bei dieser Person (siehe Startdialog)." },
  netzform: { titel:"Netzform", text:"TN-S, TN-C-S, TT oder IT nach DIN VDE 0100-410. Bestimmt u. a. die zulässige Abschaltzeit (Tab. 41.1) und wie die Fehlerschleife L–PE gebildet wird.", quelle:"DIN VDE 0100-410" },
  logo: { titel:"Firmenlogo", text:"Optionales Logo für das gedruckte Prüfprotokoll. Wird ausschließlich lokal im Browser als Base64 gespeichert – kein Upload an einen Server." },
  cmax: { titel:"c-Faktor (Spannungsfaktor)", text:"Spannungsfaktor c zur Bildung der Ersatzspannungsquelle c·Un/√3 an der Kurzschlussstelle. c_max=1,05 bei ±6 % Netztoleranz, c_max=1,10 bei +10 % Toleranz – wird für Ik_max (Ausschaltvermögen, Stoßkurzschlussstrom ip) verwendet. Für Ik_min gilt fest c_min=0,95, unabhängig von dieser Auswahl.", quelle:"DIN EN 60909-0 (VDE 0102), Tab. 1" },
  // Netzeinspeisung
  a_ik3: { titel:"Ik\" am Übergabepunkt", text:"Anfangs-Kurzschlusswechselstrom (dreipolig) am Übergabepunkt, z. B. laut Auskunft des Netzbetreibers. Ausgangswert für Modus A – daraus wird die Netzimpedanz an dieser Stelle zurückgerechnet." },
  rx_verhaeltnis: { titel:"R/X-Verhältnis", text:"Verhältnis von Wirk- zu Blindwiderstand der Quellimpedanz. Bestimmt die Aufteilung der berechneten Impedanz Z in R und X sowie den κ-Faktor (Stoßkurzschlussstrom). Vorgabewert 0,1, wenn keine genaueren Angaben vorliegen." },
  un_allgemein: { titel:"Bemessungsspannung Un", text:"Verkettete (Leiter-Leiter-)Spannung an der betrachteten Stelle, i. d. R. 400 V im Niederspannungsnetz." },
  skq: { titel:"Vorgelagerte Netzkurzschlussleistung Sk\"Q", text:"Anfangs-Kurzschlusswechselleistung des vorgelagerten Netzes an der Übergabestelle zur Oberspannungsseite des Transformators (Angabe des Netzbetreibers)." },
  un_hv: { titel:"Un Oberspannungsseite", text:"Bemessungsspannung des Netzes auf der Oberspannungsseite (Primärseite) des Transformators, z. B. 20.000 V bei einem 20-kV-Mittelspannungsnetz." },
  srt: { titel:"Bemessungsleistung SrT", text:"Bemessungsscheinleistung (Nennleistung) des Transformators in kVA, laut Typenschild." },
  ukr: { titel:"Kurzschlussspannung ukr", text:"Relative Kurzschlussspannung des Transformators in %, laut Typenschild. Bestimmt maßgeblich die Transformatorimpedanz Z_T." },
  pkrt: { titel:"Kurzschlussverlustleistung PkrT", text:"Kupferverluste des Transformators bei Bemessungsstrom (Kurzschlussversuch), laut Typenschild oder Prüfprotokoll. Bestimmt den Wirkanteil R_T der Transformatorimpedanz." },
  zs_gemessen: { titel:"Gemessene Schleifenimpedanz ZS", text:"Mit einem Messgerät (z. B. Fluke 1664 FC) ermittelte Fehlerschleifenimpedanz L–PE an der Messstelle. Dies ist ein GEMESSENER, kein gerechneter Wert – er wird als Startpunkt übernommen, die nachgelagerte Leitungsstrecke wird rechnerisch aufaddiert." },
  // Leitungsdaten (Topologie-Knoten)
  leitung_laenge: { titel:"Länge l", text:"Länge der Leitung/des Kabels von diesem Knoten zum übergeordneten Verteiler in Metern (einfache Länge, nicht Hin- und Rückweg)." },
  leitung_material: { titel:"Material", text:"Leitermaterial Kupfer (Cu) oder Aluminium (Al). Bestimmt den spezifischen Widerstand ρ und damit R der Leitung.", quelle:"DIN EN 60909-0" },
  leitung_isolierung: { titel:"Isolierung", text:"PVC oder VPE (vernetztes Polyethylen/XLPE). Bestimmt die zulässige Leiterendtemperatur im Kurzschlussfall (Vorgabe 80 °C bei PVC, 90 °C bei VPE), die für die Berechnung von Ik1min (heiße Leiterimpedanz) verwendet wird." },
  leitung_AL: { titel:"Querschnitt L", text:"Querschnitt des Außenleiters (Phase) in mm². Wird für alle Kurzschlussstrom-Berechnungen (Ik3, Ik2, Ik1) sowie für die thermische Kurzschlussfestigkeit (Adiabatengleichung) verwendet." },
  leitung_AN: { titel:"Querschnitt N", text:"Querschnitt des Neutralleiters in mm². Derzeit dokumentarisch erfasst; die Kurzschlussberechnung verwendet den Querschnitt L (Außenleiter) und PE (Schutzleiter)." },
  leitung_APE: { titel:"Querschnitt PE", text:"Querschnitt des Schutzleiters in mm². Wichtig: ist der PE-Querschnitt gegenüber L reduziert (häufig bei größeren Querschnitten), sinkt Ik1min spürbar – deshalb getrennt von L zu erfassen (siehe DIN VDE 0100-540)." , quelle:"DIN VDE 0100-540"},
  leitung_verlegeart: { titel:"Verlegeart", text:"Dokumentation der Verlegeart nach DIN VDE 0298-4 (z. B. Verlegeart B2, C, E). Derzeit reine Dokumentationsangabe für das Protokoll; die Strombelastbarkeit Iz ist separat einzutragen." , quelle:"DIN VDE 0298-4"},
  leitung_n: { titel:"Parallele Kabel n", text:"Anzahl parallel verlegter, identischer Kabel/Leitungen je Außenleiter. Reduziert R und X um den Faktor 1/n." },
  leitung_xstrich: { titel:"Reaktanzbelag x'", text:"Reaktanzbelag der Leitung in Ω/km. Vorgabewert 0,08 Ω/km für Kabel (Anhaltswert); bei genaueren Herstellerangaben hier überschreibbar.", quelle:"DIN EN 60909-4 (Anhaltswert)" },
  leitung_iz: { titel:"Belastbarkeit Iz", text:"Zulässige Dauerstrombelastbarkeit der Leitung nach Verlegeart, Häufung und Umgebungstemperatur. Wird für die Überlastschutzprüfung (Iz ≥ In, If ≤ 1,45·Iz) benötigt.", quelle:"DIN VDE 0298-4" },
  leitung_stoss: { titel:"Stoßstromfestigkeit Verteilung", text:"Bemessungs-Stoßstromfestigkeit (Ipk) der Verteilung/des Schaltschranks laut Hersteller, optional. Wird mit dem berechneten Stoßkurzschlussstrom ip verglichen." },
  leitung_stromkreisart: { titel:"Stromkreisart", text:"Endstromkreis oder Verteilungsstromkreis. Bestimmt die maßgebliche zulässige Abschaltzeit nach Tab. 41.1 (TN-System: 0,4 s bzw. 5 s)." , quelle:"DIN VDE 0100-410 Tab. 41.1"},
  // Sicherungsdatensatz (JSON, Abschnitt 4.4)
  f_hersteller: { titel:"hersteller", text:"Name des Sicherungsherstellers, wie in dessen Datenblatt angegeben. Reine Dokumentationsangabe." },
  f_typ: { titel:"typbezeichnung", text:"Typbezeichnung/Artikelnummer des Sicherungseinsatzes laut Hersteller-Datenblatt." },
  f_baugroesse: { titel:"baugroesse", text:"Baugröße nach DIN 43620: NH000, NH00, NH0, NH1, NH2, NH3, NH4, NH4a sowie die verlängerten Varianten NH1XL/NH2XL/NH3XL.", quelle:"DIN 43620" },
  f_klasse: { titel:"klasse", text:"Klassenbezeichnung aus Funktionsklasse (g=Ganzbereich, a=Teilbereich) + Betriebsklasse (G/M/R/S/Tr/B/PV/N/D). Steuert unmittelbar, ob Überlastschutz gegeben ist (siehe Zwingende Warnungen).", quelle:"DIN EN 60269-1/-2 (VDE 0636)" },
  f_in: { titel:"In_A", text:"Bemessungsstrom des Sicherungseinsatzes in Ampere. Bei gM zusätzlich Ich_A (Ausschaltvermögen-Bemessung), bei gTr stattdessen Sr_kVA." },
  f_ich: { titel:"Ich_A", text:"Nur bei Klasse gM: zweiter Bemessungsstrom, nach dem sich Baugröße/Kennlinie und Ausschaltvermögen richten (Kennzeichnung „In M Ich“, z. B. 63M100). Der Leitungsschutz richtet sich hingegen nach In." },
  f_srkva: { titel:"Sr_kVA", text:"Nur bei Klasse gTr: Bemessungsleistung des zu schützenden Transformators in kVA. Der äquivalente Bemessungsstrom errechnet sich aus In = S/(√3·Un)." },
  f_un: { titel:"Un_V", text:"Bemessungsspannung des Sicherungseinsatzes in Volt (AC oder DC, siehe „stromart“). Muss ≥ der tatsächlichen Betriebsspannung sein." },
  f_stromart: { titel:"stromart", text:"AC oder DC. Bei Klasse gPV zwingend DC – die gesamte Berechnung schaltet dann auf den Gleichstromzweig um (kein Ik2/Ik3, kein κ)." },
  f_icn: { titel:"Icn_kA", text:"Bemessungsausschaltvermögen der Sicherung in kA bei der angegebenen Spannung. Wird gegen Ik3max geprüft (Prüfung 2, Ausschaltvermögen)." },
  f_kennlinie: { titel:"kennlinie", text:"Zeit-Strom-Kennlinie als Liste von Stützstellen {t_s, I_A}. Wird doppelt-logarithmisch interpoliert/extrapoliert, um Abschaltzeit ta und Abschaltstrom Ia zu bestimmen. Stammt ausschließlich aus Herstellerunterlagen – keine Schätzwerte eintragen." },
  f_schmelzi2t: { titel:"schmelz_I2t_A2s", text:"Schmelz-I²t-Wert (nur Vorlichtbogenphase) der Sicherung in A²s. Wird bei der exakten Selektivitätsprüfung als Grenzwert der VORGELAGERTEN Sicherung verwendet." },
  f_gesamti2t: { titel:"gesamt_I2t_A2s", text:"Gesamt-I²t-Wert (Vorlichtbogen + Lichtbogen) der Sicherung in A²s. Wird für die thermische Kurzschlussfestigkeit bei ta ≤ 0,1 s sowie als Vergleichswert der NACHGELAGERTEN Sicherung bei der Selektivitätsprüfung verwendet." },
  f_durchlass: { titel:"durchlassstrom", text:"Begrenzungskennlinie als Liste {Ik_prosp_kA, Id_kA}: welcher tatsächliche (begrenzte) Durchlassstrom Id bei welchem prospektiven Kurzschlussstrom auftritt. Wird für die dynamische Beanspruchung ausgewertet." },
  f_verlust: { titel:"verlustleistung_W", text:"Verlustleistung der Sicherung bei Bemessungsstrom in Watt, laut Datenblatt. Dokumentationsangabe, z. B. für die Erwärmungsberechnung des Schaltschranks (nicht Teil dieses Tools)." },
  f_inf: { titel:"Inf_A", text:"Nur bei gG: kleiner Prüfstrom (Nichtauslösestrom) nach DIN EN 60269-2 – der Strom, bei dem die Sicherung sicher NICHT auslösen darf." , quelle:"DIN EN 60269-2"},
  f_if: { titel:"If_A", text:"Nur bei gG: großer Prüfstrom (Auslösestrom, „I2“) nach DIN EN 60269-2 – wird in der Überlastschutzprüfung als If ≤ 1,45·Iz verwendet." , quelle:"DIN EN 60269-2"},
  f_tkkonv: { titel:"tk_konv_s", text:"Konventionelle Zeit der Sicherung in Sekunden, innerhalb derer bei Inf/If definiert (nicht) ausgelöst werden muss, abhängig vom Bemessungsstrom." , quelle:"DIN EN 60269-2"},
  f_quelle: { titel:"quelle", text:"Angabe des Herstellerdatenblatts, aus dem alle Werte dieses Datensatzes entnommen wurden – erscheint auch im gedruckten Protokoll." },
  f_stand: { titel:"stand", text:"Datenstand/Ausgabedatum des verwendeten Herstellerdatenblatts – erscheint auch im gedruckten Protokoll." },
  // Ergebnis-Kennzahlen
  erg_ik3max: { titel:"Ik3max", text:"Maximaler dreipoliger Anfangs-Kurzschlusswechselstrom an diesem Knoten (c_max, 20 °C). Maßgeblich für die Prüfung des Ausschaltvermögens und den Stoßkurzschlussstrom ip.", quelle:"DIN EN 60909-0" },
  erg_ik2: { titel:"Ik2", text:"Zweipoliger Kurzschlussstrom = (√3/2)·Ik3max ≈ 0,866·Ik3max. Wird zur Information mitgeführt.", quelle:"DIN EN 60909-0" },
  erg_ik1min: { titel:"Ik1min", text:"Minimaler einpoliger Kurzschlussstrom (Fehler Außenleiter–PE) bei heißer Leitertemperatur und c_min=0,95. Maßgeblich für die Abschaltbedingung (automatische Abschaltung nach DIN VDE 0100-410).", quelle:"DIN EN 60909-0" },
  erg_zsmin: { titel:"ZS(min)", text:"Fehlerschleifenimpedanz L–PE bei heißer Leitertemperatur, aus der Ik1min berechnet wird (Ik1min = c_min·U0/ZS)." },
  erg_ip: { titel:"ip (Stoßkurzschlussstrom)", text:"Größtmöglicher Augenblickswert des Kurzschlussstroms, maßgeblich für die dynamische (mechanische) Beanspruchung von Betriebsmitteln. ip = κ·√2·Ik3max.", quelle:"DIN EN 60909-0" },
  erg_kappa: { titel:"κ (kappa)", text:"Stoßfaktor zur Berechnung von ip aus dem R/X-Verhältnis der Kurzschlussstelle: κ = 1,02 + 0,98·e^(−3·R/X). Werte zwischen 1,0 (großer R/X) und 2,0 (R/X→0).", quelle:"DIN EN 60909-0" },
  // Bewertungen
  bew_abschalt: { titel:"Abschaltbedingung", text:"Prüft, ob der vorhandene Ik1min größer/gleich dem erforderlichen Abschaltstrom Ia für die geforderte Abschaltzeit (0,4 s bzw. 5 s) ist – Grundlage für den Schutz durch automatische Abschaltung.", quelle:"DIN VDE 0100-410" },
  bew_ausschalt: { titel:"Ausschaltvermögen", text:"Prüft, ob Ik3max am Einbauort das Bemessungsausschaltvermögen Icn der Sicherung nicht überschreitet. Wird dies überschritten, ist der Einsatz unzulässig." },
  bew_ueberlast: { titel:"Überlastschutz der Leitung", text:"Prüft Iz ≥ In und If ≤ 1,45·Iz. Bei den Klassen aM/aR/aN ist diese Prüfung grundsätzlich „nicht anwendbar“, da diese Sicherungen keinen Überlastschutz bieten – ein separates Schutzorgan ist zwingend erforderlich." },
  bew_thermisch: { titel:"Thermische Kurzschlussfestigkeit", text:"Bei ta > 0,1 s über die Adiabatengleichung t_zul=(k·S/Ik)²; bei ta ≤ 0,1 s (Adiabatengleichung ungültig) über den Vergleich des Gesamt-I²t der Sicherung mit (k·S)².", quelle:"DIN VDE 0100-430" },
  bew_selektivitaet: { titel:"Selektivität", text:"Prüft, ob bei einem Kurzschluss nur die nächstgelegene (nachgelagerte) Sicherung auslöst. Faustregel 1:1,6 nur für gG/gG als Vorprüfung; exakter Nachweis über Vergleich der I²t-Werte. Bei unterschiedlichen Betriebsklassen ist ein Einzelnachweis erforderlich." },
  bew_dynamisch: { titel:"Dynamische Beanspruchung", text:"Vergleicht den Stoßkurzschlussstrom ip mit der Bemessungs-Stoßstromfestigkeit der Verteilung und ermittelt den von der Sicherung tatsächlich durchgelassenen (begrenzten) Strom Id." },
  // Anlagentopologie / Betriebsklassen / Baugrößen (übergreifend)
  topo_knoten: { titel:"Knoten (Verteiler/Endstromkreis)", text:"Jeder Knoten der Anlagentopologie steht für einen Verteiler oder einen Endstromkreis und wird über eine eigene, ihn versorgende Leitung an seinen übergeordneten Knoten angeschlossen. Für jeden Knoten werden Ik3max, Ik2, Ik1min, ZS und ip separat ausgewiesen." },
  topo_sicherung: { titel:"Sicherungszuordnung am Knoten", text:"Die einem Knoten zugeordnete Sicherung schützt die Leitung ZU diesem Knoten und sitzt damit physisch im ÜBERGEORDNETEN Verteiler." },
  betriebsklassen: { titel:"Betriebsklassen (gG, gM, aM, gR, aR, gS, gTr, gB, gPV, gN/aN/gD)", text:"Kennzeichnung aus Funktionsklasse (g=Ganzbereich mit Überlast- UND Kurzschlussschutz; a=Teilbereich, NUR Kurzschlussschutz ab ca. 4·In) und Betriebsklasse (Schutzobjekt: G=Leitungen, M=Motoren, R=Halbleiter, S=kombiniert, Tr=Transformator, B=Bergbau, PV=Photovoltaik/DC, N/D=Nordamerika).", quelle:"DIN EN 60269-1/-2 (VDE 0636)" },
  baugroessen: { titel:"Baugrößen (NH000…NH4a, NH1XL…NH3XL)", text:"Physische Baugröße des NH-Sicherungseinsatzes nach DIN 43620. Bestimmt Passform in NH-Sicherungslasttrennschaltern; die elektrischen Grenzwerte (max. In, Icn) sind je konkretem Sicherungsdatensatz hinterlegt, nicht pauschal je Baugröße geschätzt.", quelle:"DIN 43620" },
  vorlagendatenbank: { titel:"Große Vorlagen-Datenbank", text:"Legt auf einen Klick viele leere Sicherungsdatensätze für gängige Kombinationen aus Baugröße, Betriebsklasse und Bemessungsstrom (Normstromreihe) an. Enthält KEINE Kennlinien-, Icn- oder Herstellerdaten (diese dürfen nicht erfunden werden) -- dient nur als Ausgangsgerüst, das mit echten Datenblattwerten befüllt werden muss." },
  // Einfacher Modus (Sicherungs-Schnellcheck)
  einfach_strom: { titel:"Strom (Einfacher Modus)", text:"Der Strom, für den geprüft werden soll, ob eine Sicherung auslöst — z. B. ein gemessener oder berechneter Kurzschlussstrom. Es wird direkt gegen die Zeit-Strom-Kennlinie der jeweiligen Sicherung geprüft, ohne eigene Netz-/Leitungsberechnung." },
  einfach_hersteller: { titel:"Hersteller-Filter", text:"Schränkt die Anzeige auf Sicherungen eines bestimmten Herstellers aus der Bibliothek ein. „Alle“ zeigt alle in der Bibliothek vorhandenen Hersteller." },
  einfach_klasse: { titel:"Charakteristik-Filter", text:"Schränkt die Anzeige auf eine Betriebsklasse (z. B. gG, aM, gR …) ein.", quelle:"DIN EN 60269-1/-2 (VDE 0636)" },
  einfach_baugroesse: { titel:"Baugrößen-Filter (NH)", text:"Schränkt die Anzeige auf eine bestimmte NH-Baugröße ein.", quelle:"DIN 43620" }
};

// Baugrößen nach DIN 43620 -- reine Bezeichnungsliste. Numerische Grenzwerte (max. In, Icn je Un)
// werden NICHT geschätzt, sondern kommen ausschließlich aus den vom Anwender importierten
// Sicherungsdatensätzen (siehe Sicherungsbibliothek). Die Auswahllisten unten filtern daher
// direkt über die tatsächlich vorhandenen Bibliotheksdaten (dynamische Einschränkung).
const BAUGROESSEN = ["NH000","NH00","NH0","NH1","NH2","NH3","NH4","NH4a","NH1XL","NH2XL","NH3XL"];

// Vorlage für einen Sicherungsdatensatz (Abschnitt 4.4 Lastenheft) -- alle Kennwerte sind vom
// Anwender aus Herstellerunterlagen zu befüllen. Es sind KEINE Herstellerdaten vorbelegt.
function neueSicherungsvorlage(){
  return {
    hersteller: "",
    typbezeichnung: "",
    baugroesse: "NH1",
    klasse: "gG",
    In_A: null,
    Ich_A: null,     // nur gM
    Sr_kVA: null,    // nur gTr
    Un_V: 500,
    stromart: "AC",  // "AC" | "DC" (DC zwingend bei gPV)
    Icn_kA: null,
    kennlinie: [
      { t_s: 0.01, I_A: null },
      { t_s: 0.1,  I_A: null },
      { t_s: 0.2,  I_A: null },
      { t_s: 0.4,  I_A: null },
      { t_s: 1.0,  I_A: null },
      { t_s: 5.0,  I_A: null },
      { t_s: 10.0, I_A: null },
      { t_s: 3600, I_A: null }
    ],
    schmelz_I2t_A2s: null,
    gesamt_I2t_A2s: null,
    durchlassstrom: [ { Ik_prosp_kA: null, Id_kA: null } ],
    verlustleistung_W: null,
    Inf_A: null,   // kleiner Prüfstrom, nur gG
    If_A: null,    // großer Prüfstrom, nur gG (= "I2" in Bewertungslogik Abschnitt 6.3)
    tk_konv_s: null, // konventionelle Zeit
    quelle: "",
    stand: ""
  };
}

/* =========================================================================
   1b. GROSSE VORLAGEN-DATENBANK (leere Sicherungsdatensätze)
   ---------------------------------------------------------------------
   Erzeugt viele Sicherungsdatensätze für gängige Kombinationen aus Baugröße,
   Betriebsklasse und Bemessungsstrom -- als leere Vorlage (kennlinie/Icn/I²t
   usw. = null). KEINE Herstellerkennlinien oder sonstigen geschützten Werte
   werden erfunden; hersteller/typbezeichnung/quelle/stand bleiben leer und
   sind vom Anwender anhand echter Datenblätter zu befüllen. Bemessungsstrom-
   Stufen sind die allgemein bekannte IEC/DIN-Normreihe (kein Herstellergeheimnis).
   ========================================================================= */
// Allgemein bekannte Bemessungsstrom-Stufenreihe für NH-Sicherungseinsätze (IEC 60269 / DIN 43620).
const NORMSTROMREIHE_A = [6,10,16,20,25,32,40,50,63,80,100,125,160,200,224,250,315,355,400,425,500,630,800,1000,1250];
// Typische Transformator-Bemessungsleistungen [kVA] für gTr (allgemein üblich, keine Normfestlegung).
const NORMSTROMREIHE_TR_KVA = [100,160,250,315,400,500,630,800,1000,1250,1600,2000,2500];
// Anhaltswerte, bis zu welchem Bemessungsstrom eine Baugröße üblicherweise gefertigt wird
// (gängige Herstellerkataloge) -- KEINE normative Festlegung, vom Anwender gegen DIN 43620 /
// den jeweiligen Herstellerkatalog zu prüfen. Steuert nur, welche Normstromstufen je Baugröße
// als Vorlage angelegt werden.
const BAUGROESSE_MAX_IN = {
  NH000:160, NH00:160, NH0:160, NH1:250, NH2:400, NH3:630, NH4:1250, NH4a:1250,
  NH1XL:250, NH2XL:400, NH3XL:630
};
function erzeugeSicherungsVorlage(felder){
  return Object.assign(neueSicherungsvorlage(), {
    kennlinie: neueSicherungsvorlage().kennlinie,
    durchlassstrom: [ { Ik_prosp_kA:null, Id_kA:null } ]
  }, felder);
}
// Baut die große Vorlagen-Datenbank auf: gG über alle Baugrößen (volle Normstromreihe je Baugröße),
// je eine repräsentative Vorlage für aM/gR/aR/gS/gM je Baugröße, gTr über typische kVA-Stufen,
// sowie ein paar gPV-DC-Vorlagen. Insgesamt einige hundert leere Datensätze als Ausgangspunkt.
function erzeugeSicherungsVorlagenDatenbank(){
  const out = [];
  const groessen = Object.keys(BAUGROESSE_MAX_IN);
  // gG: volle Normstromreihe je Baugröße (Referenzklasse, Abschnitt 4.2 Lastenheft)
  groessen.forEach(bg=>{
    NORMSTROMREIHE_A.filter(i=>i<=BAUGROESSE_MAX_IN[bg]).forEach(In=>{
      out.push(erzeugeSicherungsVorlage({ baugroesse:bg, klasse:"gG", In_A:In, Un_V:500 }));
    });
  });
  // aM, gR, aR, gS: je Baugröße eine mittlere Normstromstufe als Startvorlage
  ["aM","gR","aR","gS"].forEach(klasse=>{
    groessen.forEach(bg=>{
      const passende = NORMSTROMREIHE_A.filter(i=>i<=BAUGROESSE_MAX_IN[bg]);
      const mitte = passende[Math.floor(passende.length/2)];
      if(mitte) out.push(erzeugeSicherungsVorlage({ baugroesse:bg, klasse, In_A:mitte, Un_V:500 }));
    });
  });
  // gM: Doppelbemessung In M Ich -- Ich bleibt null (reale Zuordnung ist herstellerspezifisch)
  groessen.forEach(bg=>{
    const passende = NORMSTROMREIHE_A.filter(i=>i<=BAUGROESSE_MAX_IN[bg]);
    const mitte = passende[Math.floor(passende.length/2)];
    if(mitte) out.push(erzeugeSicherungsVorlage({ baugroesse:bg, klasse:"gM", In_A:mitte, Ich_A:null, Un_V:500 }));
  });
  // gTr: typische Transformator-kVA-Stufen, Baugröße grob nach Leistungsklasse zugeordnet
  NORMSTROMREIHE_TR_KVA.forEach(kva=>{
    const bg = kva<=250?"NH00":kva<=630?"NH1":kva<=1250?"NH2":"NH3";
    out.push(erzeugeSicherungsVorlage({ baugroesse:bg, klasse:"gTr", Sr_kVA:kva, In_A:null, Un_V:500 }));
  });
  // gPV: DC, Beispiel-Baugrößen/-spannungen (1000/1500V DC nach DIN EN 60269-6)
  ["NH00","NH0","NH1"].forEach(bg=>{
    NORMSTROMREIHE_A.filter(i=>i<=BAUGROESSE_MAX_IN[bg]&&i<=63).forEach(In=>{
      out.push(erzeugeSicherungsVorlage({ baugroesse:bg, klasse:"gPV", In_A:In, Un_V:1000, stromart:"DC" }));
    });
  });
  return out;
}

/* ---- Info-Popover (ⓘ neben Bezeichnungen) ---- */
let openPopover = null;
function closeInfoPopover(){
  if(openPopover){ openPopover.remove(); openPopover = null; }
}
function showInfoPopover(anchorBtn, key){
  const entry = GLOSSAR[key];
  if(!entry) return;
  if(openPopover && openPopover._forKey === key){ closeInfoPopover(); return; }
  closeInfoPopover();
  const pop = el("div", { class:"info-popover" });
  pop._forKey = key;
  const closeBtn = el("button", { class:"close", text:"✕" });
  closeBtn.addEventListener("click", closeInfoPopover);
  pop.appendChild(closeBtn);
  pop.appendChild(el("h4", { text: entry.titel }));
  pop.appendChild(el("div", { text: entry.text }));
  if(entry.quelle) pop.appendChild(el("div", { class:"quelle", text:"Quelle: "+entry.quelle }));
  document.body.appendChild(pop);
  const r = anchorBtn.getBoundingClientRect();
  const popW = pop.offsetWidth, popH = pop.offsetHeight;
  let left = Math.min(Math.max(8, r.left), window.innerWidth - popW - 8);
  let top = r.bottom + 6;
  if(top + popH > window.innerHeight - 8) top = Math.max(8, r.top - popH - 6);
  pop.style.left = left+"px";
  pop.style.top = top+"px";
  openPopover = pop;
}
document.addEventListener("click", (ev)=>{
  const btn = ev.target.closest("button.infobtn");
  if(btn){ ev.preventDefault(); showInfoPopover(btn, btn.getAttribute("data-info")); return; }
  if(openPopover && !ev.target.closest(".info-popover")) closeInfoPopover();
});
window.addEventListener("resize", closeInfoPopover);
function infoIcon(key){
  const btn = el("button", { type:"button", class:"infobtn", "data-info":key, text:"ⓘ", "aria-label":"Erklärung anzeigen" });
  return btn;
}

/* ---- Glossar-Panel (durchsuchbare Gesamtübersicht) ---- */
// Gruppierung der Glossar-Einträge nach Themenbereich, für die durchsuchbare Gesamtübersicht.
const GLOSSAR_KATEGORIEN = [
  { name:"Anlagendaten", keys:["kunde","anlage","anlagenteil","pruefer","netzform","logo","cmax"] },
  { name:"Netzeinspeisung", keys:["a_ik3","rx_verhaeltnis","un_allgemein","skq","un_hv","srt","ukr","pkrt","zs_gemessen"] },
  { name:"Leitungsdaten (Topologie-Knoten)", keys:["leitung_laenge","leitung_material","leitung_isolierung","leitung_AL","leitung_AN","leitung_APE","leitung_verlegeart","leitung_n","leitung_xstrich","leitung_iz","leitung_stoss","leitung_stromkreisart"] },
  { name:"Sicherungsdatensatz (JSON, Abschnitt 4.4)", keys:["f_hersteller","f_typ","f_baugroesse","f_klasse","f_in","f_ich","f_srkva","f_un","f_stromart","f_icn","f_kennlinie","f_schmelzi2t","f_gesamti2t","f_durchlass","f_verlust","f_inf","f_if","f_tkkonv","f_quelle","f_stand"] },
  { name:"Ergebnis-Kennzahlen", keys:["erg_ik3max","erg_ik2","erg_ik1min","erg_zsmin","erg_ip","erg_kappa"] },
  { name:"Bewertungen (Abschnitt 6)", keys:["bew_abschalt","bew_ausschalt","bew_ueberlast","bew_thermisch","bew_selektivitaet","bew_dynamisch"] },
  { name:"Anlagentopologie, Betriebsklassen &amp; Baugrößen", keys:["topo_knoten","topo_sicherung","betriebsklassen","baugroessen","vorlagendatenbank"] },
  { name:"Einfacher Modus (Sicherungs-Schnellcheck)", keys:["einfach_strom","einfach_hersteller","einfach_klasse","einfach_baugroesse"] }
];
function renderGlossarList(filterText){
  const host = document.getElementById("glossarList");
  host.innerHTML = "";
  const f = (filterText||"").trim().toLowerCase();
  let treffer = 0;
  GLOSSAR_KATEGORIEN.forEach(kat=>{
    const eintraege = kat.keys.map(k=>GLOSSAR[k]).filter(Boolean)
      .filter(entry => !f || entry.titel.toLowerCase().includes(f) || entry.text.toLowerCase().includes(f));
    if(!eintraege.length) return;
    host.appendChild(el("h3", { html: kat.name }));
    eintraege.forEach(entry=>{
      treffer++;
      const div = el("div", { class:"glossar-entry" });
      div.appendChild(el("h4", { text:entry.titel }));
      div.appendChild(el("div", { class:"small", text:entry.text }));
      if(entry.quelle) div.appendChild(el("div", { class:"quelle", text:"Quelle: "+entry.quelle }));
      host.appendChild(div);
    });
  });
  if(!treffer) host.innerHTML = "";
  if(!treffer) host.appendChild(el("p", { class:"hinweis", text:"Keine Treffer." }));
}

/* ---- Sicherungsbibliothek: Listen-/Editor-Logik (Panel selbst lebt auf sicherungsbibliothek.html,
   die Anlagenberechnung auf index.html liest STATE.fuseLibrary nur lesend). Nach jeder Änderung
   der Bibliothek ruft afterFuseLibraryChange() -- soweit auf der jeweiligen Seite vorhanden --
   auch die Neuberechnung/den Knoteneditor des Rechners auf, sonst genügt saveState(). ---- */
const FUSE_LIST_MAX_ANZEIGE = 60;
function fuseSuchtext(f){
  return [f.hersteller,f.typbezeichnung,f.klasse,f.baugroesse,f.In_A,f.Ich_A,f.Sr_kVA,f.Un_V].filter(v=>v!=null).join(" ").toLowerCase();
}
function afterFuseLibraryChange(){
  renderFuseList();
  if(typeof renderNodeEditor==="function") renderNodeEditor();
  if(typeof recompute==="function") recompute();
  else if(typeof saveState==="function") saveState();
}
function renderFuseList(){
  const countEl = document.getElementById("fuseCount");
  const host = document.getElementById("fuseList");
  if(!countEl || !host) return; // Bibliotheks-Panel existiert auf dieser Seite nicht
  countEl.textContent = STATE.fuseLibrary.length;
  host.innerHTML = "";
  const filterEl = document.getElementById("fuseFilter");
  const filter = filterEl ? filterEl.value.trim().toLowerCase() : "";
  const gefiltert = filter ? STATE.fuseLibrary.filter(f=>fuseSuchtext(f).includes(filter)) : STATE.fuseLibrary;
  gefiltert.slice(0, FUSE_LIST_MAX_ANZEIGE).forEach((f)=>{
    const idx = STATE.fuseLibrary.indexOf(f);
    const card = el("div", { class:"card" });
    const head = el("div", { class:"card-head" }, [
      el("strong", { text: `${f.hersteller||"(Hersteller?)"} ${f.typbezeichnung||""} — ${f.klasse} ${f.baugroesse} ${f.In_A?f.In_A+"A":""}${f.Ich_A?" M "+f.Ich_A+"A":""}${f.Sr_kVA?f.Sr_kVA+"kVA":""} / ${f.Un_V}V` })
    ]);
    const del = el("button", { text:"✕", class:"danger" });
    del.addEventListener("click", ()=>{
      const removed = STATE.fuseLibrary.splice(idx,1)[0];
      if(removed && STATE.topologie && STATE.topologie.root) clearFuseReferences(STATE.topologie.root, removed.id);
      afterFuseLibraryChange();
    });
    head.appendChild(del);
    card.appendChild(head);
    card.appendChild(el("div", { class:"small", text: `Icn=${f.Icn_kA??"—"}kA · Quelle: ${f.quelle||"—"} (Stand ${f.stand||"—"})` }));
    host.appendChild(card);
  });
  if(gefiltert.length > FUSE_LIST_MAX_ANZEIGE){
    host.appendChild(el("p", { class:"hinweis", text:`${gefiltert.length-FUSE_LIST_MAX_ANZEIGE} weitere Treffer nicht angezeigt -- Filter oben verfeinern.` }));
  } else if(gefiltert.length===0){
    host.appendChild(el("p", { class:"hinweis", text:"Keine Treffer." }));
  }
  if(typeof refreshEinfachModus==="function") refreshEinfachModus();
}
function showFuseEditor(fuse){
  const host = document.getElementById("fuseEditorHost");
  if(!host) return;
  host.innerHTML = "";
  const card = el("div", { class:"card" });
  const headRow = el("div", { class:"card-head" });
  headRow.appendChild(el("h3", { text:"Sicherungsdatensatz anlegen/bearbeiten" }));
  const btnGlossar = el("button", { text:"❓ Felder erklären (Glossar)" });
  btnGlossar.addEventListener("click", ()=>{
    document.getElementById("glossarPanel").classList.add("open");
    document.getElementById("glossarSearch").value = "";
    renderGlossarList("");
    document.getElementById("glossarPanel").scrollIntoView({ behavior:"smooth", block:"start" });
  });
  headRow.appendChild(btnGlossar);
  card.appendChild(headRow);
  const jsonArea = el("textarea", { class:"jsonbox" });
  jsonArea.value = JSON.stringify(fuse, null, 2);
  card.appendChild(el("p", { class:"hinweis", text:"Struktur gemäß Lastenheft Abschnitt 4.4. Kennlinienwerte (I_A: null) sind vom Anwender aus den Herstellerunterlagen einzutragen -- keine Schätzwerte einsetzen. Jedes Feld ist im Glossar (Button oben bzw. Kopfzeile) unter seinem JSON-Namen erklärt." }));
  card.appendChild(jsonArea);
  const btnSave = el("button", { text:"Datensatz speichern", class:"primary" });
  btnSave.addEventListener("click", ()=>{
    try{
      const parsed = ensureFuseId(JSON.parse(jsonArea.value));
      STATE.fuseLibrary.push(parsed);
      afterFuseLibraryChange();
      host.innerHTML = "";
    }catch(e){ alert("Ungültiges JSON: "+e.message); }
  });
  const btnCancel = el("button", { text:"Abbrechen" });
  btnCancel.addEventListener("click", ()=>{ host.innerHTML=""; });
  card.append(btnSave, btnCancel);
  host.appendChild(card);
}

/* ---- Seitliches Hauptmenü (#sideMenu): drei Stufen -- collapsed (nur Menüzeichen), icons
   (nur Icons), full (Icons + Beschriftung). Der Umschalter (#btnMenuToggle) schaltet zyklisch
   durch, der Zustand wird in localStorage gemerkt und ist zwischen allen Seiten geteilt (dieselbe
   Stufe bleibt beim Wechsel zwischen Rechner und Sicherungsbibliothek erhalten). ---- */
const MENU_STATES = ["collapsed","icons","full"];
const MENU_STATE_KEY = "nhrechner_menu_state";
function getMenuState(){
  try{
    const s = localStorage.getItem(MENU_STATE_KEY);
    return MENU_STATES.includes(s) ? s : "collapsed";
  }catch(e){ return "collapsed"; }
}
function applyMenuState(state){
  document.body.classList.remove("menu-collapsed","menu-icons","menu-full");
  document.body.classList.add("menu-"+state);
  const btn = document.getElementById("btnMenuToggle");
  if(!btn) return;
  const naechsteAktion = { collapsed:"Menü: Icons anzeigen", icons:"Menü: Beschriftung anzeigen", full:"Menü einklappen" };
  btn.setAttribute("aria-label", naechsteAktion[state]);
  btn.title = naechsteAktion[state];
}
function setMenuState(state){
  try{ localStorage.setItem(MENU_STATE_KEY, state); }catch(e){}
  applyMenuState(state);
}
function initMenu(){
  applyMenuState(getMenuState());
  const toggle = document.getElementById("btnMenuToggle");
  if(toggle) toggle.addEventListener("click", ()=>{
    const next = MENU_STATES[(MENU_STATES.indexOf(getMenuState())+1) % MENU_STATES.length];
    setMenuState(next);
  });
  const backdrop = document.getElementById("menuBackdrop");
  if(backdrop) backdrop.addEventListener("click", ()=> setMenuState("collapsed"));
}
