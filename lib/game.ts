import { INTERNATIONAL_PASSAGES } from './international-passages.ts';
import { LEARNING_PASSAGES } from './learning-passages.ts';

export type GameMode = 'practice' | 'friendly' | 'ranked' | 'challenge';
export type DeviceClass = 'mobile' | 'desktop';
export type InputMethod = 'mobile_touch' | 'mobile_swipe' | 'hardware';
export type MobileInputPreference = 'tap' | 'swipe';
export type InputTelemetry = {
  physicalKeyEvents: number;
  singleInsertEvents: number;
  bulkInsertEvents: number;
  replacementEvents: number;
};
export type TypingLanguage = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it';
export type PassageCategory = 'balanced' | 'science' | 'history' | 'geography' | 'technology' | 'business' | 'sports' | 'nature' | 'health' | 'arts' | 'language';
export type PassageCategorySelection = 'all' | PassageCategory;

export const PASSAGE_CATEGORIES = [
  { code: 'all', label: 'Surprise me' },
  { code: 'balanced', label: 'Everyday stories' },
  { code: 'science', label: 'Science' },
  { code: 'history', label: 'History' },
  { code: 'geography', label: 'Geography' },
  { code: 'technology', label: 'Technology' },
  { code: 'business', label: 'Business' },
  { code: 'sports', label: 'Sports' },
  { code: 'nature', label: 'Nature' },
  { code: 'health', label: 'Health' },
  { code: 'arts', label: 'Arts & culture' },
  { code: 'language', label: 'Language' },
] as const satisfies ReadonlyArray<{ code: PassageCategorySelection; label: string }>;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
] as const satisfies ReadonlyArray<{ code: TypingLanguage; label: string; nativeLabel: string }>;

export const DEFAULT_LANGUAGE: TypingLanguage = 'en';

export function isTypingLanguage(value: unknown): value is TypingLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.some((language) => language.code === value);
}

export function isPassageCategory(value: unknown): value is PassageCategory {
  return typeof value === 'string' && PASSAGE_CATEGORIES.some((category) => category.code === value && category.code !== 'all');
}

export type DeviceSignals = {
  mobileHint?: boolean;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
};

export type PhysicalKeyEdit = {
  inputType: 'insertText' | 'deleteContentBackward';
  data: string | null;
};

export type Passage = {
  id: string;
  text: string;
  category: PassageCategory;
  language: TypingLanguage;
  title?: string;
  sourceType?: 'curated' | 'custom';
  learning?: {
    summary: string;
    sourceLabel: string;
    sourceUrl: string;
  };
};

type EnglishPassage = Omit<Passage, 'language'>;

export type TypingMetrics = {
  correctChars: number;
  incorrectChars: number;
  grossWpm: number;
  netWpm: number;
  accuracy: number;
  performanceScore: number;
};

export function detectDeviceClass({
  mobileHint,
  userAgent = '',
  platform = '',
  maxTouchPoints = 0,
}: DeviceSignals): DeviceClass {
  if (mobileHint === true) return 'mobile';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return 'mobile';
  if (platform === 'MacIntel' && maxTouchPoints > 1) return 'mobile';
  return 'desktop';
}

export function emptyInputTelemetry(): InputTelemetry {
  return {
    physicalKeyEvents: 0,
    singleInsertEvents: 0,
    bulkInsertEvents: 0,
    replacementEvents: 0,
  };
}

export function inputMethodFromTelemetry(
  deviceClass: DeviceClass,
  telemetry: InputTelemetry,
): InputMethod {
  if (deviceClass === 'desktop' || telemetry.physicalKeyEvents > 0) return 'hardware';
  if (telemetry.bulkInsertEvents > 0) return 'mobile_swipe';
  return 'mobile_touch';
}

export function physicalKeyEdit(
  key: string,
  modifiers: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; isComposing?: boolean } = {},
): PhysicalKeyEdit | null {
  if (modifiers.altKey || modifiers.ctrlKey || modifiers.metaKey || modifiers.isComposing) return null;
  if (key === 'Backspace') return { inputType: 'deleteContentBackward', data: null };
  if (Array.from(key).length === 1) return { inputType: 'insertText', data: key };
  return null;
}

const LEGACY_PASSAGE_DATA: EnglishPassage[] = [
  {
    id: 'steady-hands',
    category: 'balanced',
    text: 'Speed grows from steady hands. Stay relaxed, trust the rhythm, and let each word arrive before you chase the next one. Clean inputs will carry you farther than a frantic start.',
  },
  {
    id: 'city-lights',
    category: 'balanced',
    text: 'City lights flickered across the glass as the late train curved toward the river. Every stop brought a new voice, a quick laugh, and another story moving through the night.',
  },
  {
    id: 'morning-market',
    category: 'balanced',
    text: 'At sunrise, the market opened with bright fruit, rolling carts, and handwritten signs. Neighbors traded recipes while vendors called out the best finds of the morning.',
  },
  {
    id: 'small-signal',
    category: 'balanced',
    text: 'A small signal can cross a great distance when the message is clear. Precision gives speed a purpose, and practice turns a difficult motion into quiet instinct.',
  },
  {
    id: 'open-water',
    category: 'balanced',
    text: 'Beyond the harbor, the water opened into long blue lines. The crew checked every rope twice, watched the wind, and kept a steady course toward the pale horizon.',
  },
  {
    id: 'night-shift',
    category: 'balanced',
    text: 'The night shift learned to listen for the smallest change. A quiet click, a brighter light, or a number out of place could reveal the answer before anyone asked.',
  },
];

// Active passages are intentionally separate from the launch library above. Existing
// challenge links can still resolve legacy passages, while new runs draw only from
// this larger rotation and will not show early testers the same launch copy again.
const ENGLISH_PASSAGE_DATA: EnglishPassage[] = [
  {
    id: 'quiet-library',
    category: 'balanced',
    text: `The library opened before the city felt fully awake. A cart rolled softly between the shelves while the first readers found their usual tables near the tall windows. By midmorning, notebooks, maps, and half-finished ideas covered every desk. No one hurried, yet the room seemed to move forward one careful page at a time.`,
  },
  {
    id: 'rooftop-garden',
    category: 'balanced',
    text: `On the roof, tomato vines climbed a wire frame above the traffic. Volunteers carried small buckets of water, checked the herbs for dry leaves, and labeled each new row. The garden did not silence the city below, but it changed the view. Between the brick walls and distant towers, a patch of green made the whole block feel possible.`,
  },
  {
    id: 'early-flight',
    category: 'balanced',
    text: `The first flight of the morning boarded beneath a pale blue sky. Travelers tucked jackets into overhead bins, compared seat numbers, and watched the runway lights fade in the sunrise. The cabin grew quiet as the wheels left the ground. Far below, roads and rivers became thin lines pointing toward places that had not started their day.`,
  },
  {
    id: 'desert-road',
    category: 'balanced',
    text: `The desert road stretched straight enough to meet the horizon. Heat shimmered above the pavement while low hills changed from copper to purple in the distance. At the next stop, the driver checked the tires, filled every water bottle, and studied the paper map again. Out there, preparation mattered more than speed, and shade was never taken for granted.`,
  },
  {
    id: 'storm-window',
    category: 'balanced',
    text: `Rain tapped the apartment windows, first in scattered drops and then in a steady rush. Across the street, shop owners pulled in their signs while cyclists hurried beneath the awnings. Inside, the kettle clicked off and a lamp warmed the corner of the room. The storm made ordinary sounds feel close, clear, and surprisingly calm.`,
  },
  {
    id: 'repair-bench',
    category: 'balanced',
    text: `Every tool on the repair bench had a marked place. The old radio waited under a bright lamp with its screws arranged in a neat row beside it. A loose wire had caused weeks of silence, but the fix itself took only a minute. When music finally filled the workshop, everyone stopped long enough to hear the first full song.`,
  },
  {
    id: 'winter-trail',
    category: 'balanced',
    text: `Fresh snow softened the trail and covered yesterday's footprints. The hikers moved in single file, testing each step before shifting their weight forward. Pine branches held bright white lines against the sky, and the lake below looked almost black. At the ridge, they shared warm tea and let the wide, quiet view reward the climb.`,
  },
  {
    id: 'harbor-bells',
    category: 'balanced',
    text: `Harbor bells rang through the fog before the boats came into view. Dock workers followed familiar sounds, secured wet ropes, and guided each crew toward an open berth. Gulls circled above the warehouses as the tide pushed against the pilings. By noon, the mist had lifted, revealing a busy waterfront that had been working all along.`,
  },
  {
    id: 'bakery-door',
    category: 'balanced',
    text: `Warm air escaped each time the bakery door opened. Trays of bread cooled behind the counter while a chalkboard listed the day's pastries in careful handwriting. Regulars traded weather reports and weekend plans as they waited. Before long, the morning rush was over, leaving only crumbs, coffee cups, and the comfortable sound of another batch being mixed.`,
  },
  {
    id: 'radio-room',
    category: 'balanced',
    text: `In the radio room, every voice arrived with a layer of static. The operator adjusted a dial, repeated the coordinates, and wrote the reply in a narrow logbook. Messages traveled farther than anyone in the room could see. Each clear response was a small reminder that patient listening can connect two distant points.`,
  },
  {
    id: 'forest-map',
    category: 'balanced',
    text: `The map showed a narrow loop through the oldest part of the forest. Blue marks identified streams, while tiny triangles warned of steep ground ahead. At each crossing, the group compared the page with the shape of the hills around them. They were never truly lost, but the careful pauses helped them notice more than the fastest route would have revealed.`,
  },
  {
    id: 'science-fair',
    category: 'balanced',
    text: `Cardboard displays filled the gym from one basket to the other. Students tested small bridges, explained weather models, and reset experiments after every curious visitor. A paper rocket missed its target but produced the loudest cheer of the afternoon. The best projects were not perfect; they simply made people lean closer and ask another question.`,
  },
  {
    id: 'mountain-weather',
    category: 'balanced',
    text: `Weather changed quickly above the tree line. A clear morning could turn windy by lunch, so the guide checked the clouds as often as the trail. Extra layers, a compass, and a simple plan kept the group comfortable when the temperature dropped. The mountain offered a better view to anyone willing to respect how fast conditions could change.`,
  },
  {
    id: 'community-pool',
    category: 'balanced',
    text: `The community pool opened with a whistle and a splash. Children practiced floating near the steps while lap swimmers counted quiet turns in the deeper lanes. Towels appeared on every chair, and the smell of sunscreen followed the noon sun. For a few bright hours, the whole neighborhood seemed to meet beside the same blue water.`,
  },
  {
    id: 'theater-call',
    category: 'balanced',
    text: `Backstage, the final call moved through the theater in a whisper. Costumes hung in order, props waited on marked tables, and a strip of blue tape showed every actor where to stand. The audience heard only the opening music. Behind the curtain, dozens of small, practiced actions turned that single cue into a complete world.`,
  },
  {
    id: 'late-diner',
    category: 'balanced',
    text: `The diner stayed open long after the nearby offices went dark. A cook worked the grill, a ceiling fan turned above the counter, and the last customers spoke in low voices over fresh coffee. Outside, buses passed at longer intervals. Inside, the bright room offered a warm pause between the end of one day and the beginning of another.`,
  },
  {
    id: 'river-bridge',
    category: 'balanced',
    text: `Engineers inspected the river bridge one section at a time. They measured worn bolts, photographed the steel joints, and listened for changes beneath passing traffic. Most people crossed without noticing the work. That was the point: careful maintenance kept an ordinary route safe, dependable, and almost invisible to everyone who relied on it.`,
  },
  {
    id: 'solar-workshop',
    category: 'balanced',
    text: `Sunlight poured through the workshop windows and onto a row of small solar panels. Teams adjusted angles, compared voltage readings, and recorded how a passing cloud changed the results. The numbers were simple, but the lesson felt large. A quiet square of glass could turn an ordinary afternoon into usable energy.`,
  },
  {
    id: 'museum-hall',
    category: 'balanced',
    text: `The museum hall held objects separated by centuries but connected by human hands. A carved bowl stood near a precise brass instrument, and both drew visitors into the same patient silence. Labels offered dates and places, yet the smallest marks told their own story. Someone had shaped, repaired, carried, and valued each piece long before it reached the glass.`,
  },
  {
    id: 'orchard-path',
    category: 'balanced',
    text: `Rows of apple trees followed the slope beyond the red barn. Workers moved ladders carefully, choosing ripe fruit and leaving the rest for another week. Fallen leaves crackled along the path, and wooden crates filled one by one. Harvest looked simple from a distance, but every full box depended on timing, attention, and many practiced hands.`,
  },
  {
    id: 'newsroom-clock',
    category: 'balanced',
    text: `The newsroom clock seemed to move faster near the evening deadline. Reporters checked names, editors tightened sentences, and photographers labeled each final image. A breaking update changed the front page with minutes to spare. When the edition was finally complete, the room exhaled, then immediately began watching for tomorrow's first story.`,
  },
  {
    id: 'coast-road',
    category: 'balanced',
    text: `The coast road climbed above the water and curved around dark stone cliffs. Drivers slowed at every overlook, where wind bent the grass and waves drew white lines below. A weathered sign pointed toward a village beyond the next headland. The route took longer than the highway, but no one chose it because they were in a hurry.`,
  },
  {
    id: 'train-platform',
    category: 'balanced',
    text: `A station announcement echoed over the morning platform. Commuters folded newspapers, checked the arrival board, and stepped aside for passengers leaving the first train. Doors opened for less than a minute, yet the crowd moved with familiar precision. Then the platform cleared, and the rails hummed softly before the next arrival.`,
  },
  {
    id: 'garden-wall',
    category: 'balanced',
    text: `A low stone wall divided the garden from the narrow lane. Moss filled the oldest cracks, and small flowers had rooted where no one planned to plant them. Each spring, the owner repaired only what was loose and left the rest alone. The wall remained useful because it was cared for, not because it was made new.`,
  },
  {
    id: 'satellite-dish',
    category: 'balanced',
    text: `The satellite dish turned by a fraction and settled beneath a field of stars. Inside the control room, a signal appeared as a thin green line across the monitor. It carried no dramatic message, only measurements gathered far above the weather. Still, the team watched closely; accurate data begins with noticing small changes.`,
  },
  {
    id: 'bookshop-rain',
    category: 'balanced',
    text: `Rain sent a sudden crowd into the corner bookshop. People shook water from their coats, wandered between narrow shelves, and discovered titles they had not planned to find. The owner placed an old towel near the entrance and kept recommending favorites. By the time the clouds passed, several visitors had forgotten they were only waiting for dry weather.`,
  },
  {
    id: 'rescue-dog',
    category: 'balanced',
    text: `The rescue dog paused at the edge of the practice field and waited for a signal. One gesture sent her across the grass, around a barrier, and straight toward the hidden backpack. Training turned excitement into focus without taking away her joy. When she returned, tail moving fast, the reward was equal parts praise, play, and another chance to work.`,
  },
  {
    id: 'weekend-game',
    category: 'balanced',
    text: `Neighbors marked the field with cones before the weekend game. Teams formed without much debate, younger players took the first turn, and someone kept score on a piece of cardboard. The final point was disputed for several loud seconds. Then everyone laughed, moved the cones, and agreed that a rematch next Saturday would settle it.`,
  },
  {
    id: 'city-marathon',
    category: 'balanced',
    text: `Before sunrise, volunteers lined the city course with cups, signs, and bright direction arrows. Runners arrived in layers they would soon tie around their waists. When the race began, the front group disappeared quickly, but the streets stayed full for hours. Every pace carried its own plan, effort, and reason for reaching the finish.`,
  },
  {
    id: 'campsite-coffee',
    category: 'balanced',
    text: `Morning at the campsite began with cold air and the click of a small stove. Water warmed slowly while mist lifted from the lake beyond the trees. No one checked the time; they measured the start of the day by birdsong, hot coffee, and sunlight reaching the tent. Even a simple breakfast tasted earned after a night outdoors.`,
  },
  {
    id: 'old-camera',
    category: 'balanced',
    text: `The old camera required patience before every picture. Its metal dial clicked through the settings, the lens focused by hand, and a small meter judged the available light. There was no screen to confirm the result. That uncertainty made each frame more deliberate, as if choosing the moment mattered as much as preserving it.`,
  },
  {
    id: 'public-square',
    category: 'balanced',
    text: `By lunchtime, the public square held office workers, street musicians, delivery bicycles, and families sharing the long benches. A fountain covered the traffic noise with steady water. People arrived for different reasons and rarely stayed long. Together, their brief visits gave the open space a rhythm no architect could have drawn on a plan.`,
  },
  {
    id: 'workshop-plan',
    category: 'balanced',
    text: `The workshop plan began as three rough lines on a scrap of paper. Measurements turned the sketch into a cut list, and the cut list became a stack of carefully marked boards. A mistake in the first joint led to a better method for the second. By evening, the finished table carried a record of every adjustment that improved it.`,
  },
  {
    id: 'ferry-deck',
    category: 'balanced',
    text: `Passengers stepped onto the ferry deck as soon as the rain stopped. The city receded behind them, softened by mist and distance, while the island grew clearer ahead. Crew members checked gates and coiled ropes beside the rail. The crossing lasted only twenty minutes, but open water made it feel like a real departure.`,
  },
  {
    id: 'autumn-classroom',
    category: 'balanced',
    text: `Afternoon light crossed the classroom in long golden rectangles. A science model turned slowly near the window while students compared answers in quiet groups. Outside, wind pushed dry leaves across the playground. The final bell ended the lesson, but several notebooks remained open as one last idea was finished and underlined.`,
  },
  {
    id: 'kitchen-service',
    category: 'balanced',
    text: `During dinner service, the kitchen communicated in short, clear phrases. Pans moved from flame to counter, plates lined up beneath warm lights, and each finished order was checked before it left. Speed mattered, but confusion cost more time than care. The smoothest nights came when everyone knew both the next task and the larger plan.`,
  },
  {
    id: 'observatory-night',
    category: 'balanced',
    text: `The observatory dome opened after the last clouds moved east. A motor guided the telescope toward a point that looked empty to the naked eye. On the screen, faint light gathered into the shape of a distant galaxy. The image was not immediate or perfect, but minute by minute the universe offered more detail to anyone willing to wait.`,
  },
  {
    id: 'bike-lane',
    category: 'balanced',
    text: `The new bike lane connected the school, the park, and the row of shops near the station. Fresh paint made the route easy to follow, but the real test came during the busy morning hour. Riders signaled, drivers left space, and pedestrians watched the crossings. A useful street depended on everyone predicting one another with care.`,
  },
  {
    id: 'coral-reef',
    category: 'balanced',
    text: `Below the research boat, the reef changed color with every meter of depth. Divers moved slowly so their fins would not disturb the sand or touch fragile coral. A slate recorded fish counts, water temperature, and signs of new growth. The survey covered a small area, yet repeated observations could reveal the health of an entire coastline.`,
  },
  {
    id: 'paper-kite',
    category: 'balanced',
    text: `The paper kite refused to rise until the tail was shortened and the frame was balanced. A stronger gust pulled the string tight, lifting the bright shape above the field. Every small correction became visible in the way it turned. Soon the difficult launch looked effortless, which is often what happens when patient adjustments finally work together.`,
  },
  {
    id: 'record-store',
    category: 'balanced',
    text: `The record store organized music by genre, decade, and a system only the owner fully understood. Customers flipped through worn sleeves while a jazz album played above the counter. Recommendations passed easily between strangers. A favorite song might begin as a lucky discovery, but sharing it gave the sound a longer life.`,
  },
  {
    id: 'snow-day',
    category: 'balanced',
    text: `The school closing appeared on the screen just before breakfast. Within an hour, the quiet street filled with sleds, bright hats, and plans for an ambitious snow fort. Shovels cleared one driveway and then another. The storm disrupted every schedule, yet it also gave the neighborhood a rare day with nowhere else to be.`,
  },
  {
    id: 'tide-pool',
    category: 'balanced',
    text: `Low tide revealed a landscape that would disappear again by afternoon. Tiny crabs moved beneath flat stones, anemones closed at the touch of shadow, and clear pools reflected the sky. Visitors stepped carefully between patches of seaweed. Exploring well meant leaving every small shelter exactly where it had been found.`,
  },
  {
    id: 'neighborhood-power',
    category: 'balanced',
    text: `When the power failed, porch lights vanished across the neighborhood at once. Flashlights appeared in windows, neighbors checked on the corner store, and someone brought a battery radio outside. The outage lasted less than an hour. Still, the dark block became friendlier as people shared information instead of waiting alone.`,
  },
  {
    id: 'lighthouse-keeper',
    category: 'balanced',
    text: `At dusk, the lighthouse lens began its measured turn above the cliffs. The keeper logged the wind, tested the backup power, and cleaned salt from the outer glass. Ships far offshore would see only a repeating flash. They would not see the steady routine behind it, or how many ordinary checks kept that signal dependable through the night.`,
  },
  {
    id: 'pottery-wheel',
    category: 'balanced',
    text: `Clay wobbled on the wheel until both hands found the center. Gentle pressure raised the walls, too much pressure bent them, and a little water kept the surface moving. The first bowl leaned slightly after it dried, but it held together. Its uneven rim showed where control had replaced force during the making.`,
  },
  {
    id: 'robotics-club',
    category: 'balanced',
    text: `The robotics club had one hour to prepare for the final test. A sensor read the line correctly, but the left wheel still turned too slowly on sharp corners. The team changed one value, ran the course, and recorded the result before trying again. Progress came from small experiments that made failure useful instead of final.`,
  },
  {
    id: 'dawn-run',
    category: 'balanced',
    text: `The path was nearly empty when the runners met at dawn. They started slowly beneath streetlights, found a shared pace near the river, and reached the hill as the sky turned orange. Conversation faded on the climb and returned at the top. No one set a record, but everyone carried more energy into the day.`,
  },
  {
    id: 'farmers-weather',
    category: 'balanced',
    text: `Clouds gathered beyond the fields while the farmer checked a forecast on the kitchen radio. Seedlings needed rain, but strong wind could damage the new rows, so loose covers were secured before lunch. The first drops arrived by evening. Good planning could not control the weather, but it made uncertainty easier to meet.`,
  },
];

const ENGLISH_PASSAGES: Passage[] = ENGLISH_PASSAGE_DATA.map((passage) => ({
  ...passage,
  language: 'en',
}));

const LEGACY_PASSAGES: Passage[] = LEGACY_PASSAGE_DATA.map((passage) => ({
  ...passage,
  language: 'en',
}));

export const PASSAGES: Passage[] = [...ENGLISH_PASSAGES, ...LEARNING_PASSAGES, ...INTERNATIONAL_PASSAGES]
  .map((passage) => ({ ...passage, text: normalizeTypingInput(passage.text) }));
const ALL_PASSAGES = [...LEGACY_PASSAGES, ...PASSAGES]
  .map((passage) => ({ ...passage, text: normalizeTypingInput(passage.text) }));

export function getPassage(id: string): Passage | undefined {
  return ALL_PASSAGES.find((passage) => passage.id === id);
}

export function passagesForLanguage(language: TypingLanguage): Passage[] {
  return PASSAGES.filter((passage) => passage.language === language);
}

export function passagesForSelection(
  language: TypingLanguage,
  category: PassageCategorySelection = 'all',
): Passage[] {
  const languagePassages = passagesForLanguage(language);
  if (category === 'all') return languagePassages;
  const categoryPassages = languagePassages.filter((passage) => passage.category === category);
  return categoryPassages.length > 0 ? categoryPassages : languagePassages;
}

export function choosePassage(
  excludedIds: readonly string[] = [],
  language: TypingLanguage = DEFAULT_LANGUAGE,
  category: PassageCategorySelection = 'all',
): Passage {
  const excluded = new Set(excludedIds);
  const languagePassages = passagesForSelection(language, category);
  const pool = languagePassages.filter((passage) => !excluded.has(passage.id));
  return pool[Math.floor(Math.random() * pool.length)] ?? languagePassages[0] ?? PASSAGES[0]!;
}

export function isCustomPassage(passage: Passage): boolean {
  return passage.sourceType === 'custom' || passage.id.startsWith('custom-');
}

export function rankedPassageForLanguage(
  language: TypingLanguage,
  timestamp = Date.now(),
): Passage {
  const pool = passagesForLanguage(language);
  return pool[Math.floor(timestamp / 900_000) % pool.length] ?? PASSAGES[0]!;
}

export function normalizeTypingInput(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
    .replace(/[\u201c\u201d\uff02]/g, '"')
    .replace(/[\u00a0\u202f]/g, ' ');
}

export type TypingEdit = {
  value: string;
  insertedChars: number;
};

export function applyTypingEdit(
  current: string,
  inputType: string,
  data: string | null,
  maxLength: number,
  allowDeletion = true,
  maxInsertChars = 1,
): TypingEdit {
  if (inputType === 'deleteContentBackward' || inputType === 'deleteWordBackward') {
    if (!allowDeletion) return { value: current, insertedChars: 0 };
    const characters = Array.from(current);
    characters.pop();
    return { value: characters.join(''), insertedChars: 0 };
  }

  const acceptedInsertTypes = maxInsertChars > 1
    ? ['insertText', 'insertFromComposition', 'insertCompositionText', 'insertReplacementText', '']
    : ['insertText', 'insertFromComposition', ''];
  // Paste, drop, dictation, and history edits stay blocked. Swipe mode opens a
  // tightly bounded path for word-sized text emitted by a mobile keyboard.
  if (!acceptedInsertTypes.includes(inputType)) {
    return { value: current, insertedChars: 0 };
  }

  const characters = Array.from(normalizeTypingInput(data ?? '').replace(/[\r\n]/g, ''));
  const remaining = Math.max(0, maxLength - Array.from(current).length);
  if (characters.length < 1 || characters.length > maxInsertChars || remaining < 1) {
    return { value: current, insertedChars: 0 };
  }

  const inserted = characters.slice(0, remaining);
  return { value: current + inserted.join(''), insertedChars: inserted.length };
}

export function calculateMetrics(
  passage: string,
  input: string,
  elapsedMs: number,
  totalTypedChars = input.length,
): TypingMetrics {
  const passageCharacters = Array.from(normalizeTypingInput(passage));
  const inputCharacters = Array.from(normalizeTypingInput(input));
  let correctChars = 0;
  let incorrectChars = 0;

  for (let index = 0; index < inputCharacters.length; index += 1) {
    if (inputCharacters[index] === passageCharacters[index]) correctChars += 1;
    else incorrectChars += 1;
  }

  const minutes = Math.max(elapsedMs, 1_000) / 60_000;
  const grossWpm = totalTypedChars / 5 / minutes;
  const netWpm = Math.max(0, (correctChars / 5 - incorrectChars) / minutes);
  const attempts = correctChars + incorrectChars;
  const accuracy = attempts === 0 ? 100 : (correctChars / attempts) * 100;
  const accuracyFactor = clamp((accuracy / 100 - 0.8) / 0.18, 0, 1);
  const performanceScore = netWpm * (0.7 + 0.3 * accuracyFactor);

  return {
    correctChars,
    incorrectChars,
    grossWpm: round(grossWpm),
    netWpm: round(netWpm),
    accuracy: round(accuracy),
    performanceScore: round(performanceScore),
  };
}

export function decideWinner(
  a: Pick<TypingMetrics, 'accuracy' | 'performanceScore'>,
  b: Pick<TypingMetrics, 'accuracy' | 'performanceScore'>,
): 'a' | 'b' | 'draw' {
  const aClearsGate = a.accuracy >= 90;
  const bClearsGate = b.accuracy >= 90;
  if (aClearsGate !== bClearsGate) return aClearsGate ? 'a' : 'b';
  if (a.performanceScore !== b.performanceScore) return a.performanceScore > b.performanceScore ? 'a' : 'b';
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy ? 'a' : 'b';
  return 'draw';
}

export function xpForMode(mode: GameMode): number {
  if (mode === 'ranked') return 30;
  if (mode === 'friendly' || mode === 'challenge') return 10;
  return 20;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
