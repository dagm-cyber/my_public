// Ordlister og setninger for øving. Kun tegn som kan skrives direkte på norsk tastatur.
const WORDS = {
  no: `
og i det er på som en til av med at for har de ikke den jeg han om et var vi seg men så fra kan skal hun etter
også ble ved år ut vil eller blir bare nå da over mot hadde alle inn dette du noe man når mange får være hva bli
før opp andre sin går nye enn hvor store sitt mer få under mye dag ham godt hele nok selv tid kommer sammen
hus barn mor far bror søster venn skole bok ord land by vei bil båt tog fly sol regn snø vind hav sjø fjell skog
elv vann luft mat brød melk ost egg fisk kjøtt eple kaffe te stol bord seng dør vindu lys mørk lang kort stor
liten ny gammel god dårlig glad trist varm kald rask sakte hvit svart rød blå grønn gul fin pen sterk svak lett
tung høy lav ung tidlig sent alltid aldri ofte kanskje igjen her der hjem borte natt morgen kveld uke måned time
minutt klokke penger arbeid jobb leke spise drikke sove lese skrive snakke høre se gå løpe hoppe svømme sykle
kjøre kjøpe selge gi ta finne lete tenke vite tro like elske hjelpe spørre svare lære forstå huske glemme
begynne slutte vente komme reise bo sitte stå ligge åpne lukke vaske lage bygge spille synge danse le smile
lærer elev hånd fot arm ben hode øye øre nese munn hår hjerte kropp jente gutt mann kvinne folk verden norge
språk spørsmål svar ferie sommer vinter høst vår jul påske gave fest musikk sang film bilde farge tall maskin
telefon tastatur skjerm fingre trening øving fart feil riktig hvorfor fordi derfor mellom gjennom uten siden
blant hos langs nær fjern først sist neste halv hel ingen noen hver begge flere færre mest minst ganske veldig
nesten akkurat særlig ønske øvelse søndag mandag tirsdag onsdag torsdag fredag lørdag møte løsning både måte
små blåbær jordbær ærlig vær kjære fjær bære tær ære døgn grøt søt sør nord øst vest sjef krone tak gulv vegg
kjøkken stue hage blomst tre gress stein strand bølge måke katt hund hest ku sau gris høne fugl mus ulv bjørn
elg rev ørn laks torsk sild reke krabbe
da la ha dag all fall hall hals sal dal ask skall kall gal slag lag flagg sjal sag lass kladd sjakk hakk
`,
  en: `
the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she
or an will my one all would there their what so up out if about who get which go me when make can like time no
just him know take people into year your good some could them see other than then now look only come its over
think also back after use two how our work first well way even new want because any these give day most us
is was are were has had been said did made went got came took gave found told asked called felt kept left
water food house home school book word world life hand eye head face friend family mother father child girl boy
man woman city town road car train plane ship sea river lake hill tree wood field flower grass rain snow wind sun
moon star sky night morning evening week month hour minute money job game music song film picture colour number
key keyboard screen finger letter line page story paper pen table chair door window light dark long short big small
old young fast slow hot cold warm happy sad strong weak easy hard right wrong high low early late always never often
again here there away today tomorrow yesterday never every each both few many much more less very quite almost
read write speak listen hear walk run jump swim drive buy sell find think know believe love help ask answer learn
understand remember forget begin start stop wait travel live sit stand lie open close wash cook build play sing
dance laugh smile try call need feel leave keep bring show turn move pay meet sleep eat drink grow
practice typing speed error accuracy lesson sentence question problem idea reason place point part case fact
apple bread milk cheese egg fish meat coffee tea sugar salt bag box cup glass plate bottle
a as ask add all dad fall flask glass gas half has had lad lass sad salad shall flag hall alas falls glad
`,
};

const TEXTS = {
  no: [
    'Vår sære Zulu fra badeøya spilte jo whist og quickstep i min taxi.',
    'Øvelse gjør mester, men bare hvis du øver riktig.',
    'Hold blikket på skjermen og la fingrene finne veien selv.',
    'Pekefingrene hviler på F og J, der du kjenner de små kulene.',
    'Det er bedre å skrive sakte og riktig enn raskt og feil.',
    'I morgen skal vi gå en lang tur i fjellet hvis været er fint.',
    'Kaffen var kald, men samtalen var varm og hyggelig.',
    'Hun kjøpte tre epler, to pærer og en stor kurv med blåbær.',
    'Toget til Bergen går klokken åtte fra spor fire.',
    'Når du skriver blindt, slipper du å se ned på tastaturet.',
    'Han sa at han skulle komme, men han dukket aldri opp.',
    'Høsten kom tidlig i år, og bladene ble gule allerede i august.',
    'Mange nordmenn liker å gå på ski om vinteren.',
    'Kan du hjelpe meg med å bære denne tunge esken?',
    'Vi spiste middag sammen og snakket om alt og ingenting.',
    'Det regnet hele dagen, så vi ble inne og spilte kort.',
    'Sjøen var blank som et speil da vi rodde ut i båten.',
    'Husk å ta pauser, strekke på deg og slappe av i skuldrene.',
    'Ærlighet varer lengst, sier et gammelt ordtak.',
    'Barna bygde en snømann med gulrot til nese og stein til øyne.',
    'Møtet starter presis klokken ni, så ikke kom for sent!',
    'Hvor mange timer øver du på tastaturet hver uke?',
    'Små steg hver dag gir store resultater over tid.',
    'Jeg leste en spennende bok om en reise til Nordpolen.',
    'Fyret blinket i mørket og viste skipene veien hjem.',
    'Gode vaner er vanskelige å bygge, men lette å leve med.',
    'Tastaturet mitt har noen taster jeg alltid bommer på.',
    'Etter en lang arbeidsdag er det deilig med en kopp te.',
  ],
  en: [
    'The quick brown fox jumps over the lazy dog.',
    'Practice makes progress, so keep your eyes on the screen.',
    'Rest your index fingers on F and J and feel the small bumps.',
    'It is better to type slowly and correctly than fast and wrong.',
    'We walked along the beach and watched the sun go down.',
    'She bought three apples, two pears and a basket of berries.',
    "The train leaves at eight o'clock from platform four.",
    'Typing without looking at the keys saves a lot of time.',
    'He said he would call, but the phone never rang.',
    'Autumn came early this year, and the leaves turned gold.',
    'Can you help me carry this heavy box upstairs?',
    'We had dinner together and talked about everything.',
    'It rained all day, so we stayed inside and played cards.',
    'Remember to take breaks and relax your shoulders.',
    'Honesty is the best policy, as the old saying goes.',
    "The meeting starts at nine sharp, so don't be late!",
    'How many hours do you practise typing every week?',
    'Small steps every day lead to big results over time.',
    'I read an exciting book about a journey to the North Pole.',
    'The lighthouse blinked in the dark and guided the ships home.',
    'Good habits are hard to build but easy to live with.',
    'My keyboard has a few keys that I always seem to miss.',
    'Coffee in the morning and tea in the evening is my routine.',
    'The children built a snowman with a carrot for a nose.',
    'Learning a new skill takes patience, focus and time.',
    "Don't worry about speed yet; accuracy comes first.",
  ],
};

WORDS.no = [...new Set(WORDS.no.trim().split(/\s+/))];
WORDS.en = [...new Set(WORDS.en.trim().split(/\s+/))];
