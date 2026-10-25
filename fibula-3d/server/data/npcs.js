// Non-player characters of Patella. Dialogue is keyword driven like the
// classic NPC "behaviour" scripts: greet, then talk about keywords, "handel"
// opens the shop window, "żegnaj" ends the conversation.

export const GREET_WORDS = ['witaj', 'hi', 'hello', 'cześć', 'czesc', 'dzień dobry', 'dzien dobry', 'hej', 'siema', 'elo', 'witam'];
export const BYE_WORDS = ['żegnaj', 'zegnaj', 'bye', 'do widzenia', 'nara', 'papa', 'na razie', 'cześć!', 'farewell'];
export const TRADE_WORDS = ['handel', 'trade', 'oferta', 'sklep', 'kupić', 'kupic', 'sprzedać', 'sprzedac', 'towary'];

export const NPCS = [
  {
    key: 'priest', name: 'Ojciec Ignacy', radius: 1,
    look: { skin: 0, head: 0, body: 0, legs: 0, feet: 1, robe: true, eq: {} },
    greet: 'Niech kości ci sprzyjają, {name}. W czym mogę pomóc? Mogę cię {uleczyć} albo opowiedzieć o {zaklęciach}.',
    farewell: 'Idź z błogosławieństwem, {name}.',
    special: 'heal',
    keywords: [
      [['praca', 'job', 'kim jesteś'], 'Jestem kapłanem Świątyni Rzepki. Tu wracają dusze poległych wędrowców.'],
      [['zaklęcia', 'zaklecia', 'czary', 'spells', 'magia'], '{spells}'],
      [['fibula', 'wyspa', 'świat'], 'Fibula to wyspa w kształcie kości. Mówią, że śpi pod nią prastary smok.'],
      [['kościej', 'kosciej', 'krypta'], 'Pod starym cmentarzem w krypcie spoczywa Kościej. Nie da się go zabić... podobno.'],
      [['śmierć', 'smierc', 'death'], 'Gdy polegniesz, stracisz nieco doświadczenia i obudzisz się tutaj, w świątyni.'],
      [['poziom', 'level', 'doświadczenie'], 'Pokonuj potwory, by zdobywać doświadczenie. Na każdym poziomie rośnie twoje życie i mana.'],
    ],
  },
  {
    key: 'smith', name: 'Kowal Bogdan', radius: 1,
    look: { skin: 1, head: 7, body: 3, legs: 5, feet: 7, eq: { weapon: 'mace' }, apron: true },
    greet: 'Witaj, {name}! Szukasz dobrej stali? Powiedz {handel}.',
    farewell: 'Niech twoje ostrze nie tępieje!',
    keywords: [
      [['praca', 'job'], 'Kuję broń i zbroje dla wszystkich obrońców Patelli.'],
      [['broń', 'bron', 'miecz', 'topór', 'weapons'], 'Mam miecze, topory, buzdygany i tarcze. Powiedz {handel}, by zobaczyć towar.'],
      [['orki', 'orc'], 'Orkowie z obozu na wschodzie noszą całkiem niezłe topory. Przynieś mi je, kupię.'],
    ],
    trade: {
      buy: ['knife', 'short_sword', 'iron_sword', 'long_sword', 'hand_axe', 'battle_axe', 'club', 'mace', 'wooden_shield', 'steel_shield',
        'leather_armor', 'chain_armor', 'plate_armor', 'leather_helmet', 'iron_helmet', 'steel_helmet', 'leather_legs', 'chain_legs', 'leather_boots'],
      sell: ['knife', 'short_sword', 'iron_sword', 'long_sword', 'runed_sword', 'hand_axe', 'battle_axe', 'orc_cleaver', 'club', 'mace', 'morning_star',
        'bone_club', 'wooden_shield', 'steel_shield', 'knight_shield', 'bone_shield', 'leather_armor', 'chain_armor', 'plate_armor', 'dragon_mail',
        'leather_helmet', 'iron_helmet', 'steel_helmet', 'leather_legs', 'chain_legs', 'plate_legs', 'leather_boots'],
    },
  },
  {
    key: 'hunter', name: 'Myśliwy Hubert', radius: 1,
    look: { skin: 1, head: 5, body: 14, legs: 6, feet: 7, eq: { weapon: 'bow', head: 'leather_helmet' } },
    greet: 'Ciii... {name}, spłoszysz zwierzynę. Potrzebujesz kuszy? Powiedz {handel}.',
    farewell: 'Darz bór!',
    keywords: [
      [['praca', 'job'], 'Poluję w Lesie Strzałkowym. Skupuję skóry i łapy.'],
      [['wilki', 'wilk', 'las'], 'Wilki chodzą stadami na północy. Niedźwiedzie siedzą głębiej w lesie.'],
      [['ruiny', 'wieża', 'strażnica'], 'W ruinach starej strażnicy na północy zagnieździli się rozbójnicy. Coś tam ukrywają.'],
    ],
    trade: {
      buy: ['bow', 'arrow', 'spear', 'torch', 'meat', 'leather_boots'],
      sell: ['bow', 'elven_bow', 'spear', 'wolf_pelt', 'bear_paw', 'snake_skin', 'meat', 'ham'],
    },
  },
  {
    key: 'herbalist', name: 'Zielarka Wanda', radius: 1,
    look: { skin: 0, head: 10, body: 21, legs: 20, feet: 6, robe: true, female: true, eq: { head: 'wizard_hat' } },
    greet: 'Ach, {name}! Mikstury, różdżki, księgi... Powiedz {handel}, a coś znajdziemy.',
    farewell: 'Niech mana płynie w tobie wartko.',
    keywords: [
      [['praca', 'job'], 'Warzę mikstury i sprzedaję przedmioty magiczne. Kupuję też rzadkie składniki.'],
      [['różdżka', 'rozdzka', 'kostur', 'wand', 'rod'], 'Różdżki są dla czarnoksiężników, kostury dla druidów. Strzelają magią, zużywając trochę many.'],
      [['mikstura', 'mikstury', 'potion'], 'Czerwone leczą rany, niebieskie przywracają manę. Antidotum leczy truciznę.'],
      [['bagna', 'galareta', 'śluz'], 'Galaretowaty śluz z bagien to świetny składnik. Płacę za niego uczciwie.'],
    ],
    trade: {
      buy: ['health_potion', 'great_health_potion', 'mana_potion', 'antidote', 'wand_sparks', 'wand_embers', 'rod_moss', 'rod_frost',
        'spellbook', 'mage_robe', 'wizard_hat', 'ring_light'],
      sell: ['wand_sparks', 'wand_embers', 'rod_moss', 'rod_frost', 'spellbook', 'mage_robe', 'wizard_hat', 'slime_gel', 'spider_silk',
        'ruby', 'sapphire', 'ring_light', 'ring_vigor', 'bone_amulet', 'ember_amulet', 'lich_crown', 'dragon_scale'],
    },
  },
  {
    key: 'innkeeper', name: 'Karczmarz Zenon', radius: 1,
    look: { skin: 0, head: 6, body: 0, legs: 6, feet: 7, apron: true, eq: {} },
    greet: 'Witaj w karczmie Pod Kością, {name}! Głodny? Powiedz {handel}.',
    farewell: 'Wpadaj częściej!',
    keywords: [
      [['praca', 'job'], 'Prowadzę karczmę. Mam jedzenie, a od podróżnych kupuję różne trofea.'],
      [['jedzenie', 'głód', 'glod', 'food'], 'Najedzony wędrowiec szybciej odzyskuje siły i manę. Bez jedzenia regeneracja staje.'],
      [['plotki', 'news', 'nowości'], 'Słyszałem, że w Jaskiniach Kręgowych na zachodzie jest dziura prowadząca do smoczego leża...'],
      [['trofea', 'łupy'], 'Kupuję szczurze ogony, kły orków, włosy trolli, kości i czaszki.'],
    ],
    trade: {
      buy: ['apple', 'bread', 'cheese', 'meat', 'ham', 'fish', 'torch'],
      sell: ['rat_tail', 'orc_tooth', 'troll_hair', 'bone', 'skull', 'cheese', 'fish'],
    },
  },
  {
    key: 'guard', name: 'Strażnik Marek', radius: 2,
    look: { skin: 2, head: 3, body: 18, legs: 19, feet: 3, eq: { weapon: 'iron_sword', shield: 'steel_shield', head: 'iron_helmet', armor: 'chain_armor' } },
    greet: 'Stój! A, to ty, {name}. Bezpiecznej drogi. Pytaj o {orki}, {cmentarz} lub {jaskinie}.',
    farewell: 'Uważaj na siebie za murami.',
    keywords: [
      [['praca', 'job'], 'Pilnuję wschodniej bramy Patelli. W obrębie murów żaden potwór cię nie tknie.'],
      [['orki', 'orc', 'obóz'], 'Obóz orków leży na wschodzie. Szamani rzucają błyskawice, uważaj.'],
      [['cmentarz', 'szkielety'], 'Na południowym wschodzie jest stary cmentarz. Nocą lepiej tam nie chodzić.'],
      [['jaskinie', 'trolle', 'góry'], 'Jaskinie Kręgowe w Górach Żebrowych na zachodzie. Pełno tam trolli i pająków.'],
      [['smok', 'dragon'], 'Smok? Bajki dla dzieci... chyba.'],
    ],
  },
  {
    key: 'fisher', name: 'Rybak Józef', radius: 1,
    look: { skin: 2, head: 1, body: 17, legs: 5, feet: 6, eq: {} },
    greet: 'Ahoj, {name}! Ryby biorą dziś jak szalone. Chcesz coś? Powiedz {handel}.',
    farewell: 'Ahoj!',
    keywords: [
      [['praca', 'job'], 'Łowię ryby na przystani. Najlepsze ryby na całej Fibuli!'],
      [['bagna', 'bagno'], 'Na Bagnach Kulszowych żyją żmije i trolle bagienne. Nie właź tam bez antidotum.'],
      [['statek', 'łódź', 'rejs'], 'Moja łódka jest za mała na rejsy. Może kiedyś przypłynie tu statek z kontynentu...'],
    ],
    trade: { buy: ['fish', 'antidote'], sell: ['fish'] },
  },
];
