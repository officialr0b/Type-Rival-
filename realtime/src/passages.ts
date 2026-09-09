export type LiveTypingLanguage = 'en' | 'en-gb' | 'es' | 'fr' | 'de' | 'pt' | 'it';

type LivePassage = { id: string; language: LiveTypingLanguage; text: string };

export const LIVE_PASSAGES: Record<LiveTypingLanguage, readonly LivePassage[]> = {
  en: [
    { id: 'live-steady-hands', language: 'en', text: 'A steady rhythm turns quick reactions into reliable speed. Keep your hands relaxed, read one phrase ahead, and let accuracy build the pace. Good competition makes practice feel urgent without making it careless, and the strongest result is still the one that reaches the finish cleanly.' },
    { id: 'live-city-train', language: 'en', text: 'The city train crossed the river as evening lights appeared along the shore. Inside, two rivals watched the countdown and waited for the same first word. The doors closed, the signal changed, and both players settled into a pace they believed they could hold.' },
    { id: 'live-workshop', language: 'en', text: 'Morning rain covered the windows while the workshop came alive. Tools clicked, radios hummed, and a careful plan turned a difficult repair into progress. Each person checked the small details before moving faster, because reliable work begins with control.' },
  ],
  'en-gb': [
    { id: 'live-uk-platform', language: 'en-gb', text: 'A light drizzle followed commuters onto the railway platform. Travellers folded their umbrellas, checked the departure board and moved towards the correct carriage. The guard gave a final signal, the doors closed, and the train slipped past rows of terraced houses on its way to the city centre.' },
    { id: 'live-uk-seaside', language: 'en-gb', text: 'Along the seaside promenade, the wind carried the smell of salt and fresh chips. Families sheltered behind striped windbreaks while cyclists passed the old theatre and colourful beach huts. The forecast promised cloud, but a patch of sunshine was enough to fill every bench facing the water.' },
  ],
  es: [
    { id: 'live-es-plaza', language: 'es', text: 'La plaza despertó con el sonido de las persianas y el aroma del café recién hecho. Un repartidor dejó cajas junto a la panadería, mientras dos vecinos comparaban el pronóstico del día. Antes de que llegara el tráfico, las mesas ya estaban listas y la fuente marcaba un ritmo tranquilo en el centro.' },
    { id: 'live-es-taller', language: 'es', text: 'En el taller de bicicletas, cada herramienta tenía un lugar señalado. La mecánica ajustó los frenos, limpió la cadena y giró la rueda para escuchar cualquier roce. El arreglo parecía pequeño, pero convirtió un trayecto incómodo en un paseo suave y seguro por todo el barrio.' },
  ],
  fr: [
    { id: 'live-fr-marche', language: 'fr', text: 'Le marché ouvrit ses étals avant que la place ne soit vraiment animée. Les commerçants alignèrent les fruits, rangèrent les bouquets et inscrivirent les prix à la craie. Peu à peu, les conversations couvrirent le bruit des chariots, et chaque allée trouva son rythme.' },
    { id: 'live-fr-atelier', language: 'fr', text: 'Dans l’atelier, chaque outil avait une place précise sous la grande fenêtre. Une radio jouait doucement pendant que l’équipe vérifiait les mesures et préparait les pièces. Le travail avançait sans précipitation, car quelques secondes de contrôle évitaient de longues corrections.' },
  ],
  de: [
    { id: 'live-de-bahnhof', language: 'de', text: 'Am frühen Morgen füllte sich der Bahnhof langsam mit Reisenden. Anzeigen wechselten, Koffer rollten über den Boden und aus dem kleinen Café kam der Duft von frischem Brot. Als der Zug einfuhr, fanden alle ruhig ihren Wagen und die Türen schlossen pünktlich.' },
    { id: 'live-de-werkstatt', language: 'de', text: 'In der Werkstatt lag jedes Werkzeug an seinem markierten Platz. Eine Lampe beleuchtete das geöffnete Gerät, während die Schrauben ordentlich daneben lagen. Der Fehler war klein, doch die sorgfältige Prüfung machte aus einer unsicheren Vermutung eine zuverlässige Reparatur.' },
  ],
  pt: [
    { id: 'live-pt-praca', language: 'pt', text: 'A praça acordou com o som das portas abrindo e o aroma do café recém-passado. Um entregador deixou caixas perto da padaria, enquanto os vizinhos conversavam sobre o tempo. Antes do trânsito aumentar, as mesas já estavam prontas e a fonte marcava um ritmo tranquilo.' },
    { id: 'live-pt-oficina', language: 'pt', text: 'Na oficina, cada ferramenta tinha um lugar indicado na parede. A mecânica ajustou os freios, limpou a corrente e girou a roda para ouvir qualquer ruído. O conserto parecia pequeno, mas transformou um caminho desconfortável em um passeio suave e seguro.' },
  ],
  it: [
    { id: 'live-it-piazza', language: 'it', text: 'La piazza si svegliò con il rumore delle serrande e il profumo del caffè appena fatto. Un corriere lasciò alcune scatole vicino al forno, mentre due vicini parlavano del tempo. Prima dell’arrivo del traffico, i tavoli erano pronti e la fontana dava ritmo al mattino.' },
    { id: 'live-it-officina', language: 'it', text: 'Nell’officina, ogni attrezzo aveva un posto preciso sulla parete. La meccanica regolò i freni, pulì la catena e fece girare la ruota per ascoltare ogni rumore. La riparazione sembrava piccola, ma rese il viaggio più comodo, fluido e sicuro.' },
  ],
};

export function isLiveTypingLanguage(value: unknown): value is LiveTypingLanguage {
  return typeof value === 'string' && value in LIVE_PASSAGES;
}

export function livePassage(roomId: string, requestedLanguage: unknown = 'en'): LivePassage {
  const language = isLiveTypingLanguage(requestedLanguage) ? requestedLanguage : 'en';
  const passages = LIVE_PASSAGES[language];
  let hash = 0;
  for (const character of roomId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return passages[hash % passages.length]!;
}
