import { useRef } from 'react';
import { X } from 'lucide-react';

// ─── Visual Tag Registry ───────────────────────────────────────────────────
export const VISUAL_TAGS = [
  // Math — Early (K-5)
  'math_counting_1_20',
  'math_simple_addition_table',
  'math_simple_subtraction_table',
  'math_multiplication_table',
  'math_fractions',
  'math_place_value',
  'math_number_line',
  'math_shapes_basic',
  // Math — Intermediate / Advanced
  'math_area_model',
  'math_order_of_operations',
  'math_percent_diagram',
  'math_algebra_balance',
  'math_coordinate_plane',
  'math_geometry_shapes',
  'math_advanced_formulas',
  'math_trig_unit_circle',
  'math_statistics_chart',
  // Math — Calculus & College
  'math_calculus_derivatives',
  'math_calculus_integrals',
  'math_limits',
  'math_linear_algebra',
  'math_probability_stats',
  'math_logarithms',
  // Math — Formula & Reference Images (WebP)
  'math_order_of_operations_visual',
  'math_quadratic_formula',
  'math_area_formulas',
  'math_volume_formulas',
  'math_trig_sohcahtoa',
  'math_exponent_rules',
  'math_log_rules',
  'math_distance_midpoint',
  'math_fraction_operations',
  'math_mean_median_mode',
  'math_inequality_symbols',
  'math_coordinate_plane_quadrants',
  'math_slope_intercept_form',
  'math_systems_of_equations',
  'math_polynomial_operations',
  // Writing / ELA
  'writing_paragraph_structure',
  'writing_essay_outline',
  'writing_story_elements',
  'writing_figurative_language',
  // Grammar / Reading
  'grammar_sentence_parts',
  'grammar_parts_of_speech',
  'reading_main_idea',
  'reading_compare_contrast',
  'reading_cause_effect',
  'reading_text_structure',
  // English — College
  'english_thesis_development',
  'english_argument_structure',
  'english_research_paper_structure',
  'english_citation_formats',
  'english_college_grammar',
  'english_rhetorical_devices',
  'english_literary_analysis',
  'english_critical_reading',
  'english_parts_of_speech_advanced',
  'english_logical_fallacies',
  // Language — Alphabets & Systems
  'lang_alphabet_english',
  'lang_alphabet_spanish',
  'lang_alphabet_french',
  'lang_alphabet_japanese',
  'lang_alphabet_chinese',
  'lang_german_alphabet',
  'lang_korean_hangul',
  'lang_arabic_alphabet',
  'lang_russian_cyrillic',
  'lang_japanese_katakana',
  'lang_spanish_verb_conjugation',
  'lang_french_verb_conjugation',
  'lang_chinese_tones',
  // Science
  'science_cell_diagram',
  'science_water_cycle',
  'science_food_chain',
  'science_scientific_method',
  'science_states_of_matter',
  'science_human_body_systems',
  'science_solar_system',
  'periodic_table_simplified',
  'science_atomic_structure',
  'science_chemical_bonding',
  'science_dna_genetics',
  'science_punnett_square',
  // Physics
  'physics_newtons_laws',
  'physics_electromagnetic_spectrum',
  'physics_formulas',
  'physics_thermodynamics',
  // History / Social Studies
  'history_timeline',
  'history_cause_effect_chain',
  'history_three_branches',
  'history_map_compass',
  // Geography — Maps
  'geography_continents',
  'geography_usa_map',
  'geography_world_map',
  'geography_europe_map',
  'geography_africa_map',
  'geography_north_america_map',
  'geography_asia_map',
  'geography_greenland_map',
  'geography_south_america_map',
  'geography_australia_map',
  'geography_lat_long',
  // Economics
  'economics_supply_demand',
  'economics_gdp',
  'economics_market_structures',
  'economics_fiscal_monetary',
  'economics_comparative_advantage',
  // Political Science
  'polisci_constitution',
  'polisci_bill_of_rights',
  'polisci_world_governments',
  // Study Skills
  'study_skills_kwl',
  'study_skills_concept_map',
  'study_skills_cornell_notes',
  'study_blooms_taxonomy',
  'study_time_management',
  // Chemistry (WebP Images)
  'chemistry_molecular_shapes',
  'chemistry_organic_functional_groups',
  'chemistry_periodic_trends',
  'chemistry_ph_scale',
  'chemistry_types_of_bonds',
  // Economics (WebP Images)
  'economics_banking_system',
  'economics_business_cycle',
  'economics_circular_flow',
  'economics_inflation_deflation',
  'economics_stock_market_basics',
  'economics_taxes_types',
  'economics_trade_balance',
  // Geography (WebP Images)
  'geography_biomes_world',
  'geography_country_capitals',
  'geography_landforms',
  'geography_ocean_currents',
  'geography_population_density',
  'geography_rivers_major',
  'geography_tectonic_plates',
  'geography_time_zones',
  'geography_us_regions',
  // History (WebP Images)
  'history_amendments_visual',
  'history_ancient_civilizations_map',
  'history_civil_rights_timeline',
  'history_cold_war_map',
  'history_colonialism_map',
  'history_greek_roman_comparison',
  'history_immigration_waves',
  'history_industrial_revolution',
  'history_us_expansion_map',
  'history_world_wars_map',
  // Language (WebP Images)
  'lang_chinese_radicals',
  'lang_german_cases',
  'lang_ipa_chart',
  'lang_japanese_common_phrases',
  'lang_japanese_hiragana_chart',
  'lang_spanish_common_phrases',
  // Math (WebP Images)
  'math_3d_shapes',
  'math_angles_types',
  'math_circle_parts',
  'math_derivative_tangent',
  'math_exponential_vs_linear',
  'math_fractions_pizza',
  'math_integral_area',
  'math_matrix_operations',
  'math_money_coins',
  'math_normal_distribution',
  'math_pythagorean_theorem',
  'math_quadratic_graph',
  'math_slope_types',
  'math_telling_time',
  'math_vector_addition',
  // Physics (WebP Images)
  'physics_circuit_symbols',
  'physics_doppler_effect',
  'physics_electricity_flow',
  'physics_forces_diagram',
  'physics_optics_lenses',
  'physics_pendulum_energy',
  'physics_projectile_motion',
  'physics_wave_types',
  // Reading (WebP Images)
  'reading_genres_bookshelf',
  'reading_story_mountain',
  // Science (WebP Images)
  'science_animal_cell',
  'science_brain_regions',
  'science_cloud_types',
  'science_ear_anatomy',
  'science_electromagnetic_wave',
  'science_eye_anatomy',
  'science_heart_diagram',
  'science_human_muscles',
  'science_human_skeleton',
  'science_layers_of_earth',
  'science_moon_phases',
  'science_photosynthesis',
  'science_plant_cell',
  'science_rock_cycle',
  'science_tides_diagram',
  'science_volcano_cross_section',
  'science_water_cycle_illustrated',
  'science_weather_map_symbols',
  // Space (WebP Images)
  'space_asteroid_belt',
  'space_earth_detailed',
  'space_galaxy_types',
  'space_jupiter_saturn',
  'space_mars_surface',
  'space_moon_surface',
  'space_planet_sizes',
  'space_solar_system_distances',
  'space_sun_diagram',
  // Study Skills (WebP Images)
  'study_essay_writing_process',
  'study_growth_mindset',
  'study_note_taking_methods',
  'study_pomodoro_technique',
  'study_test_taking_strategies',
  // Writing (WebP Images)
  'writing_persuasive_structure',
  'writing_types_comparison',
] as const;

export type VisualTag = typeof VISUAL_TAGS[number];

// ─── Image-Based Visuals (WebP) ────────────────────────────────────────────
// Tags that have rich WebP images in /visuals/ — rendered as <img> instead of SVG
const IMAGE_VISUALS: Record<string, string> = {
  chemistry_molecular_shapes: '/visuals/chemistry_molecular_shapes.webp',
  chemistry_organic_functional_groups: '/visuals/chemistry_organic_functional_groups.webp',
  chemistry_periodic_trends: '/visuals/chemistry_periodic_trends.webp',
  chemistry_ph_scale: '/visuals/chemistry_ph_scale.webp',
  chemistry_types_of_bonds: '/visuals/chemistry_types_of_bonds.webp',
  economics_banking_system: '/visuals/economics_banking_system.webp',
  economics_business_cycle: '/visuals/economics_business_cycle.webp',
  economics_circular_flow: '/visuals/economics_circular_flow.webp',
  economics_inflation_deflation: '/visuals/economics_inflation_deflation.webp',
  economics_stock_market_basics: '/visuals/economics_stock_market_basics.webp',
  economics_taxes_types: '/visuals/economics_taxes_types.webp',
  economics_trade_balance: '/visuals/economics_trade_balance.webp',
  geography_biomes_world: '/visuals/geography_biomes_world.webp',
  geography_country_capitals: '/visuals/geography_country_capitals.webp',
  geography_landforms: '/visuals/geography_landforms.webp',
  geography_ocean_currents: '/visuals/geography_ocean_currents.webp',
  geography_population_density: '/visuals/geography_population_density.webp',
  geography_rivers_major: '/visuals/geography_rivers_major.webp',
  geography_tectonic_plates: '/visuals/geography_tectonic_plates.webp',
  geography_time_zones: '/visuals/geography_time_zones.webp',
  geography_us_regions: '/visuals/geography_us_regions.webp',
  history_amendments_visual: '/visuals/history_amendments_visual.webp',
  history_ancient_civilizations_map: '/visuals/history_ancient_civilizations_map.webp',
  history_civil_rights_timeline: '/visuals/history_civil_rights_timeline.webp',
  history_cold_war_map: '/visuals/history_cold_war_map.webp',
  history_colonialism_map: '/visuals/history_colonialism_map.webp',
  history_greek_roman_comparison: '/visuals/history_greek_roman_comparison.webp',
  history_immigration_waves: '/visuals/history_immigration_waves.webp',
  history_industrial_revolution: '/visuals/history_industrial_revolution.webp',
  history_us_expansion_map: '/visuals/history_us_expansion_map.webp',
  history_world_wars_map: '/visuals/history_world_wars_map.webp',
  lang_chinese_radicals: '/visuals/lang_chinese_radicals.webp',
  lang_german_cases: '/visuals/lang_german_cases.webp',
  lang_ipa_chart: '/visuals/lang_ipa_chart.webp',
  lang_japanese_common_phrases: '/visuals/lang_japanese_common_phrases.webp',
  lang_japanese_hiragana_chart: '/visuals/lang_japanese_hiragana_chart.webp',
  lang_spanish_common_phrases: '/visuals/lang_spanish_common_phrases.webp',
  math_3d_shapes: '/visuals/math_3d_shapes.webp',
  math_angles_types: '/visuals/math_angles_types.webp',
  math_circle_parts: '/visuals/math_circle_parts.webp',
  math_derivative_tangent: '/visuals/math_derivative_tangent.webp',
  math_exponential_vs_linear: '/visuals/math_exponential_vs_linear.webp',
  math_fractions_pizza: '/visuals/math_fractions_pizza.webp',
  math_integral_area: '/visuals/math_integral_area.webp',
  math_matrix_operations: '/visuals/math_matrix_operations.webp',
  math_money_coins: '/visuals/math_money_coins.webp',
  math_normal_distribution: '/visuals/math_normal_distribution.webp',
  math_pythagorean_theorem: '/visuals/math_pythagorean_theorem.webp',
  math_quadratic_graph: '/visuals/math_quadratic_graph.webp',
  math_slope_types: '/visuals/math_slope_types.webp',
  math_telling_time: '/visuals/math_telling_time.webp',
  math_vector_addition: '/visuals/math_vector_addition.webp',
  physics_circuit_symbols: '/visuals/physics_circuit_symbols.webp',
  physics_doppler_effect: '/visuals/physics_doppler_effect.webp',
  physics_electricity_flow: '/visuals/physics_electricity_flow.webp',
  physics_forces_diagram: '/visuals/physics_forces_diagram.webp',
  physics_optics_lenses: '/visuals/physics_optics_lenses.webp',
  physics_pendulum_energy: '/visuals/physics_pendulum_energy.webp',
  physics_projectile_motion: '/visuals/physics_projectile_motion.webp',
  physics_wave_types: '/visuals/physics_wave_types.webp',
  reading_genres_bookshelf: '/visuals/reading_genres_bookshelf.webp',
  reading_story_mountain: '/visuals/reading_story_mountain.webp',
  science_animal_cell: '/visuals/science_animal_cell.webp',
  science_solar_system: '/visuals/space_planet_sizes.webp',
  math_coordinate_plane: '/visuals/math_coordinate_plane_quadrants.webp',
  math_order_of_operations: '/visuals/math_order_of_operations_visual.webp',
  science_water_cycle: '/visuals/science_water_cycle_illustrated.webp',
  science_brain_regions: '/visuals/science_brain_regions.webp',
  science_cloud_types: '/visuals/science_cloud_types.webp',
  science_ear_anatomy: '/visuals/science_ear_anatomy.webp',
  science_electromagnetic_wave: '/visuals/science_electromagnetic_wave.webp',
  science_eye_anatomy: '/visuals/science_eye_anatomy.webp',
  science_heart_diagram: '/visuals/science_heart_diagram.webp',
  science_human_muscles: '/visuals/science_human_muscles.webp',
  science_human_skeleton: '/visuals/science_human_skeleton.webp',
  science_layers_of_earth: '/visuals/science_layers_of_earth.webp',
  science_moon_phases: '/visuals/science_moon_phases.webp',
  science_photosynthesis: '/visuals/science_photosynthesis.webp',
  science_plant_cell: '/visuals/science_plant_cell.webp',
  science_rock_cycle: '/visuals/science_rock_cycle.webp',
  science_tides_diagram: '/visuals/science_tides_diagram.webp',
  science_volcano_cross_section: '/visuals/science_volcano_cross_section.webp',
  science_water_cycle_illustrated: '/visuals/science_water_cycle_illustrated.webp',
  science_weather_map_symbols: '/visuals/science_weather_map_symbols.webp',
  space_asteroid_belt: '/visuals/space_asteroid_belt.webp',
  space_earth_detailed: '/visuals/space_earth_detailed.webp',
  space_galaxy_types: '/visuals/space_galaxy_types.webp',
  space_jupiter_saturn: '/visuals/space_jupiter_saturn.webp',
  space_mars_surface: '/visuals/space_mars_surface.webp',
  space_moon_surface: '/visuals/space_moon_surface.webp',
  space_planet_sizes: '/visuals/space_planet_sizes.webp',
  space_solar_system_distances: '/visuals/space_solar_system_distances.webp',
  space_sun_diagram: '/visuals/space_sun_diagram.webp',
  study_essay_writing_process: '/visuals/study_essay_writing_process.webp',
  study_growth_mindset: '/visuals/study_growth_mindset.webp',
  study_note_taking_methods: '/visuals/study_note_taking_methods.webp',
  study_pomodoro_technique: '/visuals/study_pomodoro_technique.webp',
  study_test_taking_strategies: '/visuals/study_test_taking_strategies.webp',
  writing_persuasive_structure: '/visuals/writing_persuasive_structure.webp',
  writing_types_comparison: '/visuals/writing_types_comparison.webp',
  math_area_formulas: '/visuals/math_area_formulas.webp',
  math_coordinate_plane_quadrants: '/visuals/math_coordinate_plane_quadrants.webp',
  math_distance_midpoint: '/visuals/math_distance_midpoint.webp',
  math_exponent_rules: '/visuals/math_exponent_rules.webp',
  math_fraction_operations: '/visuals/math_fraction_operations.webp',
  math_fractions: '/visuals/math_fractions.webp',
  math_inequality_symbols: '/visuals/math_inequality_symbols.webp',
  math_log_rules: '/visuals/math_log_rules.webp',
  math_mean_median_mode: '/visuals/math_mean_median_mode.webp',
  math_order_of_operations_visual: '/visuals/math_order_of_operations_visual.webp',
  math_polynomial_operations: '/visuals/math_polynomial_operations.webp',
  math_quadratic_formula: '/visuals/math_quadratic_formula.webp',
  math_slope_intercept_form: '/visuals/math_slope_intercept_form.webp',
  math_systems_of_equations: '/visuals/math_systems_of_equations.webp',
  math_trig_sohcahtoa: '/visuals/math_trig_sohcahtoa.webp',
  math_volume_formulas: '/visuals/math_volume_formulas.webp',
};

// ══════════════════════════════════════════════════════════════
// MATH — EARLY / K-5
// ══════════════════════════════════════════════════════════════

function MathCounting120() {
  const nums = Array.from({ length: 20 }, (_, i) => i + 1);
  const words = ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
  const colors = ['bg-red-200','bg-orange-200','bg-yellow-200','bg-green-200','bg-teal-200','bg-blue-200','bg-indigo-200'];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Counting Numbers 1–20</p>
      <div className="grid grid-cols-5 gap-1.5">
        {nums.map(n => (
          <div key={n} className={`${colors[(n-1)%colors.length]} border border-border rounded-lg w-12 h-12 flex flex-col items-center justify-center`}>
            <span className="text-lg font-black text-foreground leading-none">{n}</span>
            <span className="text-muted-foreground leading-none" style={{fontSize:'8px'}}>{words[n-1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MathSimpleAdditionTable() {
  const size = 6;
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Addition Table (0–{size-1})</p>
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-7 h-7 bg-green-200 dark:bg-green-900/40 text-center font-black rounded-tl">+</th>
            {Array.from({ length: size }, (_, i) => (
              <th key={i} className="w-7 h-7 bg-green-100 dark:bg-green-900/30 text-center font-bold">{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: size }, (_, row) => (
            <tr key={row}>
              <td className="w-7 h-7 bg-green-100 dark:bg-green-900/30 text-center font-bold">{row}</td>
              {Array.from({ length: size }, (_, col) => (
                <td key={col} className={`w-7 h-7 text-center border border-border/40 font-semibold
                  ${row+col===0?'bg-yellow-100 dark:bg-yellow-900/30':row===col?'bg-green-50 dark:bg-green-950/20':'bg-background'}`}>
                  {row+col}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-muted-foreground bg-muted rounded p-1.5 text-center w-full">Row + column = sum. 🟡 Yellow = zero. 🟢 Diagonal = doubles!</div>
    </div>
  );
}

function MathSimpleSubtractionTable() {
  const size = 6;
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Subtraction Table (0–{size-1})</p>
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-7 h-7 bg-orange-200 dark:bg-orange-900/40 text-center font-black">−</th>
            {Array.from({ length: size }, (_, i) => (
              <th key={i} className="w-7 h-7 bg-orange-100 dark:bg-orange-900/30 text-center font-bold">{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: size }, (_, row) => (
            <tr key={row}>
              <td className="w-7 h-7 bg-orange-100 dark:bg-orange-900/30 text-center font-bold">{row}</td>
              {Array.from({ length: size }, (_, col) => {
                const val = row - col;
                return (
                  <td key={col} className={`w-7 h-7 text-center border border-border/40 font-semibold
                    ${val<0?'bg-red-50 dark:bg-red-950/20 text-red-500':val===0?'bg-yellow-100 dark:bg-yellow-900/30':'bg-background'}`}>
                    {val < 0 ? '—' : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-muted-foreground bg-muted rounded p-1.5 text-center w-full">🔴 Can't subtract yet! 🟡 Zero. Row minus column = answer.</div>
    </div>
  );
}

function MathMultiplicationTable() {
  const size = 6;
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Multiplication Table (1–{size})</p>
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-7 h-7 bg-muted font-bold">×</th>
            {Array.from({ length: size }, (_, i) => (
              <th key={i} className="w-7 h-7 bg-blue-100 dark:bg-blue-900/40 text-center font-bold">{i+1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: size }, (_, row) => (
            <tr key={row}>
              <td className="w-7 h-7 bg-blue-100 dark:bg-blue-900/40 text-center font-bold">{row+1}</td>
              {Array.from({ length: size }, (_, col) => (
                <td key={col} className={`w-7 h-7 text-center border border-border/40
                  ${(row+1)===(col+1)?'bg-yellow-200 dark:bg-yellow-800/40 font-bold':'bg-background'}`}>
                  {(row+1)*(col+1)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs text-muted-foreground text-center">🟡 Yellow = perfect squares</div>
    </div>
  );
}

function MathFractions() {
  return (
    <div className="flex flex-col items-center gap-4 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Fraction Bars</p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {[{label:'1 Whole',parts:1,color:'bg-blue-400'},{label:'1/2',parts:2,color:'bg-green-400'},{label:'1/4',parts:4,color:'bg-yellow-400'},{label:'1/8',parts:8,color:'bg-orange-400'}].map(({label,parts,color})=>(
          <div key={label} className="flex items-center gap-2">
            <span className="text-xs font-semibold w-10 text-right">{label}</span>
            <div className="flex flex-1 gap-px border border-border rounded overflow-hidden">
              {Array.from({length:parts}).map((_,i)=>(
                <div key={i} className={`${color} h-7 flex-1 opacity-80 flex items-center justify-center`}>
                  <span className="text-white font-bold" style={{fontSize:'9px'}}>{parts>1?`1/${parts}`:'1'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MathPlaceValue() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Place Value Chart</p>
      <div className="flex gap-1">
        {[{label:'Thousands',value:'1,000',color:'bg-purple-400'},{label:'Hundreds',value:'100',color:'bg-blue-400'},{label:'Tens',value:'10',color:'bg-green-400'},{label:'Ones',value:'1',color:'bg-yellow-400'}].map(({label,value,color})=>(
          <div key={label} className="flex flex-col items-center gap-1">
            <div className={`${color} rounded-t px-2 py-1 text-center`}><div className="text-white text-xs font-bold">{label}</div></div>
            <div className="border border-border w-16 h-12 flex items-center justify-center bg-muted rounded-b"><span className="font-mono text-sm font-bold">{value}</span></div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground text-center">Each place is 10× the one to its right</div>
    </div>
  );
}

function MathNumberLine() {
  const ticks = [-3,-2,-1,0,1,2,3];
  return (
    <div className="flex flex-col items-center gap-4 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Number Line</p>
      <div className="flex items-center">
        <div className="w-4 h-px bg-foreground/60"/><div className="text-foreground/60 text-xs">←</div>
        {ticks.map(n=>(
          <div key={n} className="flex flex-col items-center">
            <div className="w-10 h-px bg-foreground/60"/>
            <div className={`w-px ${n===0?'h-5 bg-foreground':'h-3 bg-foreground/60'}`}/>
            <span className={`text-xs mt-1 ${n===0?'font-bold text-foreground':'text-muted-foreground'}`}>{n}</span>
          </div>
        ))}
        <div className="text-foreground/60 text-xs">→</div><div className="w-4 h-px bg-foreground/60"/>
      </div>
      <div className="text-xs text-muted-foreground text-center">Negative ← Zero → Positive</div>
    </div>
  );
}

function MathShapesBasic() {
  const shapes = [
    {name:'Circle',emoji:'⭕',fact:'No corners or sides'},
    {name:'Triangle',emoji:'🔺',fact:'3 sides, 3 corners'},
    {name:'Square',emoji:'🟥',fact:'4 equal sides'},
    {name:'Rectangle',emoji:'▬',fact:'4 sides, 2 pairs equal'},
    {name:'Pentagon',emoji:'⬠',fact:'5 sides'},
    {name:'Hexagon',emoji:'⬡',fact:'6 sides'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Basic 2D Shapes</p>
      <div className="grid grid-cols-3 gap-2 w-full">
        {shapes.map(({name,emoji,fact})=>(
          <div key={name} className="border border-border rounded-lg p-2 text-center bg-muted/30">
            <div className="text-2xl">{emoji}</div>
            <div className="text-xs font-bold">{name}</div>
            <div className="text-xs text-muted-foreground">{fact}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MATH — INTERMEDIATE / ADVANCED
// ══════════════════════════════════════════════════════════════

function MathAreaModel() {
  return (
    <div className="flex flex-col items-center gap-4 p-2">
      <p className="text-sm font-semibold text-center text-muted-foreground">Area Model: Distributive Property</p>
      <div className="text-center font-mono text-base font-bold">2(x + 11) = 2·x + 2·11</div>
      <div className="flex items-start gap-1">
        <div className="flex flex-col items-center justify-center h-20 mt-6">
          <span className="text-sm font-bold mr-1">2</span>
          <div className="w-px h-16 bg-foreground/60"/>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1 pl-1">
            <div className="flex items-center justify-center w-28 text-sm font-semibold">← x →</div>
            <div className="flex items-center justify-center w-20 text-sm font-semibold">← 11 →</div>
          </div>
          <div className="flex gap-1">
            <div className="w-28 h-16 bg-yellow-400/80 border-2 border-yellow-600 rounded flex items-center justify-center">
              <div className="text-center"><div className="font-bold text-yellow-900 text-sm">A</div><div className="text-xs text-yellow-800">2 × x = 2x</div></div>
            </div>
            <div className="w-20 h-16 bg-amber-300/80 border-2 border-amber-600 rounded flex items-center justify-center">
              <div className="text-center"><div className="font-bold text-amber-900 text-sm">B</div><div className="text-xs text-amber-800">2 × 11 = 22</div></div>
            </div>
          </div>
        </div>
      </div>
      <div className="text-center p-2 bg-muted rounded-lg"><span className="font-bold text-sm">Total Area = 2x + 22</span></div>
    </div>
  );
}

function MathOrderOfOperations() {
  const steps = [
    {label:'P',full:'Parentheses',ex:'( )',color:'bg-red-500'},
    {label:'E',full:'Exponents',ex:'x²',color:'bg-orange-500'},
    {label:'M',full:'Multiply',ex:'×',color:'bg-yellow-500'},
    {label:'D',full:'Divide',ex:'÷',color:'bg-yellow-400'},
    {label:'A',full:'Add',ex:'+',color:'bg-green-500'},
    {label:'S',full:'Subtract',ex:'−',color:'bg-blue-500'},
  ];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Order of Operations (PEMDAS)</p>
      <div className="flex gap-1.5 flex-wrap justify-center">
        {steps.map(({label,full,ex,color})=>(
          <div key={label} className={`${color} text-white rounded-lg p-2 text-center w-16`}>
            <div className="text-xl font-black">{label}</div>
            <div className="text-xs font-semibold">{full}</div>
            <div className="text-sm">{ex}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground bg-muted rounded p-2 text-center">Always solve in this order, left to right within each step.</div>
    </div>
  );
}

function MathPercentDiagram() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Percent, Part & Whole</p>
      <div className="flex gap-2 items-center text-sm font-bold">
        <div className="bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-500 rounded px-3 py-2">Part</div>
        <div>=</div>
        <div className="bg-green-100 dark:bg-green-900/40 border-2 border-green-500 rounded px-3 py-2">%</div>
        <div>×</div>
        <div className="bg-purple-100 dark:bg-purple-900/40 border-2 border-purple-500 rounded px-3 py-2">Whole</div>
      </div>
      <div className="w-full bg-muted rounded-full h-6 overflow-hidden border border-border">
        <div className="bg-blue-500 h-full flex items-center justify-center text-white text-xs font-bold" style={{width:'30%'}}>30%</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs w-full">
        <div className="bg-muted rounded p-2 text-center"><div className="font-bold">Find Part</div><div className="text-muted-foreground">% × Whole</div></div>
        <div className="bg-muted rounded p-2 text-center"><div className="font-bold">Find %</div><div className="text-muted-foreground">Part ÷ Whole</div></div>
        <div className="bg-muted rounded p-2 text-center"><div className="font-bold">Find Whole</div><div className="text-muted-foreground">Part ÷ %</div></div>
      </div>
    </div>
  );
}

function MathAlgebraBalance() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Algebra — Balance Scale</p>
      <div className="text-center font-mono text-lg font-bold">2x + 3 = 11</div>
      <div className="flex items-end justify-center gap-2 w-full">
        <div className="bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-500 rounded-lg p-2 text-center w-24">
          <div className="text-sm font-bold text-blue-700 dark:text-blue-300">2x + 3</div>
          <div className="text-xs text-muted-foreground">Left side</div>
        </div>
        <div className="flex flex-col items-center pb-2">
          <div className="text-lg font-bold">=</div>
          <div className="text-xs text-muted-foreground">balanced</div>
        </div>
        <div className="bg-green-100 dark:bg-green-900/40 border-2 border-green-500 rounded-lg p-2 text-center w-24">
          <div className="text-sm font-bold text-green-700 dark:text-green-300">11</div>
          <div className="text-xs text-muted-foreground">Right side</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground bg-muted rounded p-2 text-center w-full">Whatever you do to one side, do to the other. −3 → 2x=8 → x=4</div>
    </div>
  );
}

function MathCoordinatePlane() {
  const size=100; const mid=50;
  const pts=[{x:70,y:30,label:'(2,2)'},{x:30,y:70,label:'(-2,-2)'},{x:70,y:70,label:'(2,-2)'},{x:30,y:30,label:'(-2,2)'}];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Coordinate Plane</p>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-44 h-44 border border-border rounded bg-background">
        <line x1={mid} y1={2} x2={mid} y2={size-2} stroke="currentColor" strokeWidth="0.8" opacity="0.6"/>
        <line x1={2} y1={mid} x2={size-2} y2={mid} stroke="currentColor" strokeWidth="0.8" opacity="0.6"/>
        {[-2,-1,1,2].map(n=>(
          <g key={n}>
            <line x1={mid+n*20} y1={mid-2} x2={mid+n*20} y2={mid+2} stroke="currentColor" strokeWidth="0.6"/>
            <text x={mid+n*20} y={mid+7} textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.7">{n}</text>
            <line x1={mid-2} y1={mid-n*20} x2={mid+2} y2={mid-n*20} stroke="currentColor" strokeWidth="0.6"/>
            <text x={mid-8} y={mid-n*20+2} textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.7">{n}</text>
          </g>
        ))}
        {pts.map(p=>(
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r="2.5" fill="#3b82f6"/>
            <text x={p.x+4} y={p.y-3} fontSize="5" fill="#3b82f6">{p.label}</text>
          </g>
        ))}
        <text x={mid+2} y={5} fontSize="6" fill="currentColor">y</text>
        <text x={size-6} y={mid+8} fontSize="6" fill="currentColor">x</text>
      </svg>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {['Q I (+,+)','Q II (-,+)','Q IV (+,-)','Q III (-,-)'].map(q=>(
          <div key={q} className="bg-muted rounded px-2 py-1 text-center">{q}</div>
        ))}
      </div>
    </div>
  );
}

function MathGeometryShapes() {
  const shapes = [
    {name:'Triangle',svg:<polygon points="40,10 10,50 70,50" fill="none" stroke="#3b82f6" strokeWidth="2"/>,fact:'3 sides · angles=180°'},
    {name:'Rectangle',svg:<rect x="8" y="18" width="64" height="34" fill="none" stroke="#10b981" strokeWidth="2"/>,fact:'Opposite sides equal'},
    {name:'Circle',svg:<circle cx="40" cy="35" r="25" fill="none" stroke="#f59e0b" strokeWidth="2"/>,fact:'C=2πr · A=πr²'},
    {name:'Trapezoid',svg:<polygon points="20,50 60,50 70,20 10,20" fill="none" stroke="#8b5cf6" strokeWidth="2"/>,fact:'1 pair parallel sides'},
  ];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Geometry Shapes</p>
      <div className="grid grid-cols-2 gap-3">
        {shapes.map(({name,svg,fact})=>(
          <div key={name} className="flex flex-col items-center gap-1 border border-border rounded p-2 bg-muted/30">
            <svg viewBox="0 0 80 60" className="w-20 h-14">{svg}</svg>
            <div className="text-xs font-bold">{name}</div>
            <div className="text-xs text-muted-foreground text-center">{fact}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MathAdvancedFormulas() {
  const formulas = [
    {cat:'Algebra',items:['Quadratic: x = (−b ± √(b²−4ac)) / 2a','Slope: m = (y₂−y₁)/(x₂−x₁)','Point-slope: y−y₁ = m(x−x₁)']},
    {cat:'Geometry',items:['Area circle: A = πr²','Volume sphere: V = 4/3πr³','Pythagorean: a² + b² = c²']},
    {cat:'Trig Ratios',items:['sin θ = opp/hyp','cos θ = adj/hyp','tan θ = opp/adj']},
    {cat:'Exponents',items:['aᵐ·aⁿ = aᵐ⁺ⁿ','aᵐ/aⁿ = aᵐ⁻ⁿ','(aᵐ)ⁿ = aᵐⁿ']},
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Advanced Formula Reference</p>
      {formulas.map(({cat,items})=>(
        <div key={cat} className="border-l-4 border-blue-500 pl-2 py-0.5 bg-muted/30 rounded-r">
          <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-0.5">{cat}</div>
          {items.map(f=><div key={f} className="text-xs font-mono text-foreground/80">{f}</div>)}
        </div>
      ))}
    </div>
  );
}

function MathTrigUnitCircle() {
  const angles = [
    {deg:'0°',rad:'0',sin:'0',cos:'1',x:88,y:50},
    {deg:'30°',rad:'π/6',sin:'1/2',cos:'√3/2',x:80,y:35},
    {deg:'45°',rad:'π/4',sin:'√2/2',cos:'√2/2',x:71,y:29},
    {deg:'60°',rad:'π/3',sin:'√3/2',cos:'1/2',x:58,y:20},
    {deg:'90°',rad:'π/2',sin:'1',cos:'0',x:50,y:12},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Trig Unit Circle (Q1)</p>
      <svg viewBox="0 0 100 100" className="w-40 h-40 border border-border rounded bg-background">
        <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
        <line x1="12" y1="50" x2="88" y2="50" stroke="currentColor" strokeWidth="0.6" opacity="0.5"/>
        <line x1="50" y1="12" x2="50" y2="88" stroke="currentColor" strokeWidth="0.6" opacity="0.5"/>
        {angles.map(a=>(
          <g key={a.deg}>
            <circle cx={a.x} cy={a.y} r="1.8" fill="#3b82f6"/>
            <text x={a.x+2} y={a.y-2} fontSize="4" fill="#3b82f6">{a.deg}</text>
          </g>
        ))}
        <text x="50" y="98" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.7">cos</text>
        <text x="4" y="50" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.7">sin</text>
      </svg>
      <div className="w-full overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead><tr>{['θ','rad','sin','cos'].map(h=><th key={h} className="bg-muted px-1 py-0.5 font-bold text-center border border-border/40">{h}</th>)}</tr></thead>
          <tbody>{angles.map(a=>(
            <tr key={a.deg}>{[a.deg,a.rad,a.sin,a.cos].map((v,i)=>(
              <td key={i} className="px-1 py-0.5 text-center border border-border/40 font-mono">{v}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function MathStatisticsChart() {
  const concepts = [
    {name:'Mean',def:'Sum ÷ count',ex:'(2+4+6)÷3 = 4',color:'border-blue-400 bg-blue-50 dark:bg-blue-950/30'},
    {name:'Median',def:'Middle value when sorted',ex:'2, 4, 6 → median=4',color:'border-green-400 bg-green-50 dark:bg-green-950/30'},
    {name:'Mode',def:'Most frequent value',ex:'1,2,2,3 → mode=2',color:'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30'},
    {name:'Range',def:'Max − Min',ex:'6 − 2 = 4',color:'border-red-400 bg-red-50 dark:bg-red-950/30'},
    {name:'Std Dev',def:'Spread from mean',ex:'σ = √(Σ(x−μ)²/n)',color:'border-purple-400 bg-purple-50 dark:bg-purple-950/30'},
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Statistics Reference</p>
      {concepts.map(({name,def,ex,color})=>(
        <div key={name} className={`border-l-4 ${color} rounded-r px-2 py-1.5`}>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-bold w-14 flex-shrink-0">{name}</span>
            <span className="text-xs text-muted-foreground">{def}</span>
          </div>
          <div className="text-xs font-mono text-foreground/70 pl-14">{ex}</div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// LANGUAGE — ALPHABETS
// ══════════════════════════════════════════════════════════════

function LangAlphabetEnglish() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const vowels = new Set(['A','E','I','O','U']);
  const colors = ['bg-red-200','bg-orange-200','bg-yellow-200','bg-green-200','bg-teal-200','bg-blue-200','bg-indigo-200'];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">English Alphabet (26 Letters)</p>
      <div className="flex flex-wrap gap-1 justify-center">
        {letters.map((l,i)=>(
          <div key={l} className={`${vowels.has(l)?'bg-red-400 text-white':'text-foreground '+colors[i%colors.length]} border border-border rounded w-8 h-8 flex items-center justify-center font-bold text-sm`}>{l}</div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground text-center bg-muted rounded p-1.5 w-full">
        🔴 Vowels: A E I O U &nbsp;|&nbsp; All others are consonants (21 total)
      </div>
    </div>
  );
}

function LangAlphabetSpanish() {
  const letters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','Ñ','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  const vowels = new Set(['A','E','I','O','U']);
  const special = new Set(['Ñ']);
  const colors = ['bg-red-200','bg-orange-200','bg-yellow-200','bg-green-200','bg-teal-200','bg-blue-200'];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Español — Alfabeto (27 Letters)</p>
      <div className="flex flex-wrap gap-1 justify-center">
        {letters.map((l,i)=>(
          <div key={l} className={`${vowels.has(l)?'bg-red-400 text-white':special.has(l)?'bg-yellow-400 text-foreground border-yellow-600':'text-foreground '+colors[i%colors.length]} border border-border rounded w-8 h-8 flex items-center justify-center font-bold text-sm`}>{l}</div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground text-center bg-muted rounded p-1.5 w-full">
        🔴 Vowels: A E I O U &nbsp;|&nbsp; 🟡 Ñ = unique to Spanish &nbsp;|&nbsp; Accents: á é í ó ú ü
      </div>
    </div>
  );
}

function LangAlphabetFrench() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const accented = ['à','â','ç','é','è','ê','ë','î','ï','ô','ù','û','ü','œ','æ'];
  const vowels = new Set(['A','E','I','O','U','Y']);
  const colors = ['bg-blue-200','bg-gray-100','bg-red-200'];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Français — Alphabet (26 + accents)</p>
      <div className="flex flex-wrap gap-1 justify-center">
        {letters.map((l,i)=>(
          <div key={l} className={`${vowels.has(l)?'bg-blue-400 text-white':'text-foreground '+colors[i%colors.length]} border border-border rounded w-8 h-8 flex items-center justify-center font-bold text-sm`}>{l}</div>
        ))}
      </div>
      <div className="border border-border rounded p-2 w-full bg-muted/30">
        <div className="text-xs font-bold mb-1">Accented Letters (common):</div>
        <div className="flex flex-wrap gap-1">
          {accented.map(a=>(
            <div key={a} className="bg-blue-100 dark:bg-blue-900/40 border border-blue-300 rounded px-1.5 py-0.5 text-sm font-semibold">{a}</div>
          ))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground text-center">Same 26 letters + accents that change pronunciation. Cedilla ç = soft "s" sound.</div>
    </div>
  );
}

function LangAlphabetJapanese() {
  const hiragana = [
    {roma:'a',hira:'あ'},{roma:'i',hira:'い'},{roma:'u',hira:'う'},{roma:'e',hira:'え'},{roma:'o',hira:'お'},
    {roma:'ka',hira:'か'},{roma:'ki',hira:'き'},{roma:'ku',hira:'く'},{roma:'ke',hira:'け'},{roma:'ko',hira:'こ'},
    {roma:'sa',hira:'さ'},{roma:'shi',hira:'し'},{roma:'su',hira:'す'},{roma:'se',hira:'せ'},{roma:'so',hira:'そ'},
    {roma:'ta',hira:'た'},{roma:'chi',hira:'ち'},{roma:'tsu',hira:'つ'},{roma:'te',hira:'て'},{roma:'to',hira:'と'},
    {roma:'na',hira:'な'},{roma:'ni',hira:'に'},{roma:'nu',hira:'ぬ'},{roma:'ne',hira:'ね'},{roma:'no',hira:'の'},
  ];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">日本語 — Hiragana (first 25)</p>
      <div className="grid grid-cols-5 gap-1">
        {hiragana.map(({roma,hira})=>(
          <div key={roma} className="border border-border rounded bg-muted/30 flex flex-col items-center py-1 px-0.5">
            <span className="text-base font-bold">{hira}</span>
            <span className="text-xs text-muted-foreground">{roma}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground text-center bg-muted rounded p-1.5 w-full">
        3 scripts: Hiragana (46) · Katakana (46) · Kanji (thousands). Hiragana = native Japanese words.
      </div>
    </div>
  );
}

function LangAlphabetChinese() {
  const chars = [
    {char:'一',pinyin:'yī',meaning:'one'},{char:'二',pinyin:'èr',meaning:'two'},{char:'三',pinyin:'sān',meaning:'three'},
    {char:'人',pinyin:'rén',meaning:'person'},{char:'大',pinyin:'dà',meaning:'big'},{char:'小',pinyin:'xiǎo',meaning:'small'},
    {char:'山',pinyin:'shān',meaning:'mountain'},{char:'水',pinyin:'shuǐ',meaning:'water'},{char:'日',pinyin:'rì',meaning:'sun/day'},
    {char:'月',pinyin:'yuè',meaning:'moon'},{char:'木',pinyin:'mù',meaning:'tree'},{char:'火',pinyin:'huǒ',meaning:'fire'},
    {char:'土',pinyin:'tǔ',meaning:'earth'},{char:'口',pinyin:'kǒu',meaning:'mouth'},{char:'手',pinyin:'shǒu',meaning:'hand'},
  ];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">中文 — Common Characters</p>
      <div className="grid grid-cols-3 gap-1.5 w-full">
        {chars.map(({char,pinyin,meaning})=>(
          <div key={char} className="border border-border rounded bg-muted/30 flex flex-col items-center py-1.5 px-1">
            <span className="text-2xl font-bold leading-tight">{char}</span>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{pinyin}</span>
            <span className="text-xs text-muted-foreground">{meaning}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground text-center bg-muted rounded p-1.5 w-full">
        Chinese uses characters (汉字 hànzì), not an alphabet. ~50,000 exist; literacy needs ~3,000.
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// WRITING / ELA
// ══════════════════════════════════════════════════════════════

function WritingParagraphStructure() {
  const parts = [
    {label:'Topic Sentence',desc:'States the main idea',color:'bg-blue-500',width:'w-full'},
    {label:'Supporting Detail 1',desc:'Evidence or example',color:'bg-green-400',width:'w-5/6'},
    {label:'Supporting Detail 2',desc:'Evidence or example',color:'bg-green-400',width:'w-5/6'},
    {label:'Supporting Detail 3',desc:'Evidence or example',color:'bg-green-400',width:'w-5/6'},
    {label:'Concluding Sentence',desc:'Wraps up the paragraph',color:'bg-blue-500',width:'w-full'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Paragraph Structure</p>
      <div className="flex flex-col gap-1.5 w-full">
        {parts.map(({label,desc,color,width})=>(
          <div key={label} className={`${width} mx-auto`}>
            <div className={`${color} text-white rounded px-2 py-1.5 flex justify-between items-center`}>
              <span className="text-xs font-bold">{label}</span><span className="text-xs opacity-80">{desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WritingEssayOutline() {
  const sections = [
    {label:'Introduction',items:['Hook','Background','Thesis Statement'],color:'border-blue-500 bg-blue-50 dark:bg-blue-950/30'},
    {label:'Body Paragraph 1',items:['Topic Sentence','Evidence','Analysis'],color:'border-green-500 bg-green-50 dark:bg-green-950/30'},
    {label:'Body Paragraph 2',items:['Topic Sentence','Evidence','Analysis'],color:'border-green-500 bg-green-50 dark:bg-green-950/30'},
    {label:'Conclusion',items:['Restate Thesis','Summary','Closing Thought'],color:'border-purple-500 bg-purple-50 dark:bg-purple-950/30'},
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Essay Outline</p>
      {sections.map(({label,items,color})=>(
        <div key={label} className={`border-l-4 ${color} rounded-r px-2 py-1`}>
          <div className="text-xs font-bold mb-0.5">{label}</div>
          <ul className="flex flex-wrap gap-x-3">{items.map(item=><li key={item} className="text-xs text-muted-foreground">• {item}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

function WritingStoryElements() {
  const elements = [
    {label:'Characters',icon:'👤',desc:'Who is in the story?'},
    {label:'Setting',icon:'🌍',desc:'Where & when?'},
    {label:'Conflict',icon:'⚡',desc:'The main problem'},
    {label:'Rising Action',icon:'📈',desc:'Events build up'},
    {label:'Climax',icon:'🔺',desc:'The turning point'},
    {label:'Resolution',icon:'✅',desc:'Problem is solved'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Story Elements</p>
      <div className="grid grid-cols-2 gap-2 w-full">
        {elements.map(({label,icon,desc})=>(
          <div key={label} className="flex items-start gap-2 border border-border rounded p-2 bg-muted/30">
            <span className="text-lg">{icon}</span>
            <div><div className="text-xs font-bold">{label}</div><div className="text-xs text-muted-foreground">{desc}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WritingFigurativeLanguage() {
  const devices = [
    {name:'Simile',def:'Comparison using like/as',ex:'"Fast as lightning"'},
    {name:'Metaphor',def:'Direct comparison (no like/as)',ex:'"Life is a journey"'},
    {name:'Personification',def:'Giving human traits to non-human',ex:'"The wind whispered"'},
    {name:'Hyperbole',def:'Extreme exaggeration',ex:'"I\'ve told you a million times"'},
    {name:'Alliteration',def:'Repeated consonant sounds',ex:'"Peter Piper picked..."'},
    {name:'Onomatopoeia',def:'Words that sound like what they mean',ex:'"Buzz, crash, sizzle"'},
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Figurative Language</p>
      {devices.map(({name,def,ex})=>(
        <div key={name} className="border-l-4 border-blue-400 pl-2 py-0.5">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{name}:</span>
          <span className="text-xs text-muted-foreground ml-1">{def}</span>
          <div className="text-xs italic text-foreground/70">{ex}</div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// GRAMMAR / READING
// ══════════════════════════════════════════════════════════════

function GrammarSentenceParts() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Parts of a Sentence</p>
      <div className="bg-muted rounded-lg p-3 w-full text-center">
        <p className="text-base font-bold">
          <span className="text-blue-600 dark:text-blue-400">The dog</span>{' '}
          <span className="text-green-600 dark:text-green-400">quickly ran</span>{' '}
          <span className="text-orange-600 dark:text-orange-400">to the park</span>.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-xs justify-center">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500"/><span><strong>Subject</strong></span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500"/><span><strong>Predicate</strong></span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500"/><span><strong>Object/Phrase</strong></span></div>
      </div>
    </div>
  );
}

function GrammarPartsOfSpeech() {
  const pos = [
    {name:'Noun',ex:'dog, city, love',color:'bg-blue-100 dark:bg-blue-900/40 border-blue-400'},
    {name:'Verb',ex:'run, is, think',color:'bg-green-100 dark:bg-green-900/40 border-green-400'},
    {name:'Adjective',ex:'big, red, fast',color:'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-400'},
    {name:'Adverb',ex:'quickly, very, often',color:'bg-orange-100 dark:bg-orange-900/40 border-orange-400'},
    {name:'Pronoun',ex:'he, she, they, it',color:'bg-purple-100 dark:bg-purple-900/40 border-purple-400'},
    {name:'Preposition',ex:'in, on, under, with',color:'bg-pink-100 dark:bg-pink-900/40 border-pink-400'},
    {name:'Conjunction',ex:'and, but, or, so',color:'bg-teal-100 dark:bg-teal-900/40 border-teal-400'},
    {name:'Interjection',ex:'Wow! Oh! Hey!',color:'bg-red-100 dark:bg-red-900/40 border-red-400'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">8 Parts of Speech</p>
      <div className="grid grid-cols-2 gap-1.5 w-full">
        {pos.map(({name,ex,color})=>(
          <div key={name} className={`border ${color} rounded p-1.5`}>
            <div className="text-xs font-bold">{name}</div>
            <div className="text-xs text-muted-foreground italic">{ex}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadingMainIdea() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Finding the Main Idea</p>
      <div className="flex flex-col items-center gap-1 w-full">
        <div className="bg-blue-500 text-white rounded-full px-4 py-2 text-sm font-bold">Main Idea</div>
        <div className="w-px h-4 bg-foreground/40"/>
        <div className="grid grid-cols-3 gap-2 w-full">
          {['Detail 1','Detail 2','Detail 3'].map(d=>(
            <div key={d} className="flex flex-col items-center gap-1">
              <div className="w-px h-3 bg-foreground/40"/>
              <div className="bg-green-400/80 text-green-900 dark:text-green-100 rounded px-2 py-1 text-xs font-semibold text-center">{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground text-center bg-muted rounded p-2"><strong>Ask:</strong> What is this mostly about? Details support the main idea.</div>
    </div>
  );
}

function ReadingCompareContrast() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Compare & Contrast (Venn Diagram)</p>
      <div className="flex items-center justify-center relative w-full h-32">
        <div className="absolute left-4 w-28 h-28 rounded-full border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30 flex items-start justify-start p-2">
          <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold">Only A</span>
        </div>
        <div className="absolute right-4 w-28 h-28 rounded-full border-2 border-green-500 bg-green-50 dark:bg-green-950/30 flex items-start justify-end p-2">
          <span className="text-xs text-green-700 dark:text-green-300 font-semibold">Only B</span>
        </div>
        <div className="relative z-10 text-center">
          <div className="text-xs font-bold">Both</div>
          <div className="text-xs text-muted-foreground">Similarities</div>
        </div>
      </div>
      <div className="flex justify-between w-full text-xs font-bold">
        <span className="text-blue-600 dark:text-blue-400">Subject A</span>
        <span className="text-green-600 dark:text-green-400">Subject B</span>
      </div>
    </div>
  );
}

function ReadingCauseEffect() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Cause & Effect</p>
      {[1,2,3].map(i=>(
        <div key={i} className="flex items-center gap-2 w-full">
          <div className="bg-orange-100 dark:bg-orange-900/40 border border-orange-400 rounded px-2 py-1 text-xs font-semibold flex-1 text-center">Cause {i}</div>
          <span className="text-lg">→</span>
          <div className="bg-blue-100 dark:bg-blue-900/40 border border-blue-400 rounded px-2 py-1 text-xs font-semibold flex-1 text-center">Effect {i}</div>
        </div>
      ))}
      <div className="text-xs text-muted-foreground text-center bg-muted rounded p-2 w-full">A <strong>cause</strong> is why something happens. An <strong>effect</strong> is what happens as a result.</div>
    </div>
  );
}

function ReadingTextStructure() {
  const structures = [
    {name:'Description',signal:'For example, such as',icon:'📝'},
    {name:'Sequence',signal:'First, next, then, finally',icon:'1️⃣'},
    {name:'Compare/Contrast',signal:'However, on the other hand',icon:'⚖️'},
    {name:'Cause/Effect',signal:'Because, as a result, so',icon:'🔗'},
    {name:'Problem/Solution',signal:'The problem is... One solution...',icon:'💡'},
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Text Structures</p>
      {structures.map(({name,signal,icon})=>(
        <div key={name} className="flex items-start gap-2 border border-border rounded p-1.5 bg-muted/30">
          <span className="text-base">{icon}</span>
          <div><div className="text-xs font-bold">{name}</div><div className="text-xs text-muted-foreground italic">{signal}</div></div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SCIENCE
// ══════════════════════════════════════════════════════════════

function ScienceCellDiagram() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Plant vs Animal Cell</p>
      <div className="grid grid-cols-2 gap-3 w-full">
        {[
          {title:'Animal Cell',parts:['Cell Membrane','Nucleus','Cytoplasm','Mitochondria','Ribosomes'],color:'border-blue-400 bg-blue-50 dark:bg-blue-950/30'},
          {title:'Plant Cell',parts:['Cell Wall','Cell Membrane','Nucleus','Chloroplasts','Vacuole (large)'],color:'border-green-400 bg-green-50 dark:bg-green-950/30'},
        ].map(({title,parts,color})=>(
          <div key={title} className={`border-2 ${color} rounded-lg p-2`}>
            <div className="text-xs font-bold text-center mb-1">{title}</div>
            {parts.map(p=><div key={p} className="text-xs text-muted-foreground">• {p}</div>)}
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground bg-muted rounded p-2 text-center">Plant cells have a cell wall + chloroplasts. Animal cells do not.</div>
    </div>
  );
}

function ScienceWaterCycle() {
  const steps = [
    {icon:'☀️',label:'Evaporation',desc:'Water → vapor (heat)'},
    {icon:'☁️',label:'Condensation',desc:'Vapor → clouds'},
    {icon:'🌧️',label:'Precipitation',desc:'Rain, snow, sleet'},
    {icon:'🌊',label:'Collection',desc:'Lakes, rivers, ocean'},
    {icon:'🌱',label:'Transpiration',desc:'Plants release vapor'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">The Water Cycle</p>
      {steps.map(({icon,label,desc},i)=>(
        <div key={label} className="flex items-center gap-2 w-full">
          <span className="text-xl w-8">{icon}</span>
          <div className="flex-1 border border-border rounded px-2 py-1 bg-muted/30">
            <span className="text-xs font-bold">{label}:</span>
            <span className="text-xs text-muted-foreground ml-1">{desc}</span>
          </div>
          {i<steps.length-1&&<span className="text-muted-foreground text-xs">↓</span>}
        </div>
      ))}
    </div>
  );
}

function ScienceFoodChain() {
  const chain = [
    {label:'Sun',role:'Energy Source',icon:'☀️',color:'bg-yellow-200 dark:bg-yellow-900/40'},
    {label:'Grass',role:'Producer',icon:'🌿',color:'bg-green-200 dark:bg-green-900/40'},
    {label:'Rabbit',role:'Primary Consumer',icon:'🐰',color:'bg-blue-200 dark:bg-blue-900/40'},
    {label:'Fox',role:'Secondary Consumer',icon:'🦊',color:'bg-orange-200 dark:bg-orange-900/40'},
    {label:'Eagle',role:'Apex Predator',icon:'🦅',color:'bg-red-200 dark:bg-red-900/40'},
  ];
  return (
    <div className="flex flex-col items-center gap-1 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Food Chain</p>
      {chain.map(({label,role,icon,color},i)=>(
        <div key={label} className="flex flex-col items-center">
          <div className={`${color} border border-border rounded-lg px-4 py-1.5 flex items-center gap-2`}>
            <span className="text-xl">{icon}</span>
            <div><div className="text-xs font-bold">{label}</div><div className="text-xs text-muted-foreground">{role}</div></div>
          </div>
          {i<chain.length-1&&<div className="text-muted-foreground text-sm">↓ eats</div>}
        </div>
      ))}
    </div>
  );
}

function ScienceScientificMethod() {
  const steps = [
    {num:'1',label:'Question',icon:'❓',desc:'What do you want to find out?'},
    {num:'2',label:'Hypothesis',icon:'💡',desc:'Make an educated guess (if...then...)'},
    {num:'3',label:'Experiment',icon:'🔬',desc:'Test your hypothesis'},
    {num:'4',label:'Data',icon:'📊',desc:'Record your observations'},
    {num:'5',label:'Conclusion',icon:'✅',desc:'Does the data support your hypothesis?'},
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Scientific Method</p>
      {steps.map(({num,label,icon,desc})=>(
        <div key={num} className="flex items-start gap-2 border border-border rounded p-1.5 bg-muted/30">
          <div className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">{num}</div>
          <div><span className="text-xs font-bold">{icon} {label}:</span><span className="text-xs text-muted-foreground ml-1">{desc}</span></div>
        </div>
      ))}
    </div>
  );
}

function ScienceStatesOfMatter() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">States of Matter</p>
      <div className="flex gap-2">
        {[
          {name:'Solid',icon:'🧊',shape:'Fixed',volume:'Fixed',ex:'Ice, rock',color:'bg-blue-100 dark:bg-blue-900/40 border-blue-400'},
          {name:'Liquid',icon:'💧',shape:'No fixed',volume:'Fixed',ex:'Water, juice',color:'bg-green-100 dark:bg-green-900/40 border-green-400'},
          {name:'Gas',icon:'💨',shape:'No fixed',volume:'No fixed',ex:'Steam, air',color:'bg-orange-100 dark:bg-orange-900/40 border-orange-400'},
        ].map(({name,icon,shape,volume,ex,color})=>(
          <div key={name} className={`border ${color} rounded-lg p-2 flex-1 text-center`}>
            <div className="text-2xl">{icon}</div>
            <div className="text-xs font-bold">{name}</div>
            <div className="text-xs text-muted-foreground">Shape: {shape}</div>
            <div className="text-xs text-muted-foreground">Vol: {volume}</div>
            <div className="text-xs italic">{ex}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground bg-muted rounded p-2 text-center w-full">Add heat: Solid → Liquid → Gas &nbsp;|&nbsp; Remove heat: Gas → Liquid → Solid</div>
    </div>
  );
}

function ScienceHumanBodySystems() {
  const systems = [
    {name:'Skeletal',icon:'🦴',role:'Structure & support'},
    {name:'Muscular',icon:'💪',role:'Movement'},
    {name:'Circulatory',icon:'❤️',role:'Pumps blood'},
    {name:'Respiratory',icon:'🫁',role:'Breathing / oxygen'},
    {name:'Digestive',icon:'🫃',role:'Breaks down food'},
    {name:'Nervous',icon:'🧠',role:'Controls body signals'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Human Body Systems</p>
      <div className="grid grid-cols-2 gap-2 w-full">
        {systems.map(({name,icon,role})=>(
          <div key={name} className="flex items-center gap-2 border border-border rounded p-1.5 bg-muted/30">
            <span className="text-xl">{icon}</span>
            <div><div className="text-xs font-bold">{name}</div><div className="text-xs text-muted-foreground">{role}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScienceSolarSystem() {
  const planets = [
    {name:'Mercury',dist:'0.4 AU',fact:'Closest to Sun',color:'bg-gray-300'},
    {name:'Venus',dist:'0.7 AU',fact:'Hottest planet',color:'bg-yellow-200'},
    {name:'Earth',dist:'1 AU',fact:'Life exists here',color:'bg-blue-300'},
    {name:'Mars',dist:'1.5 AU',fact:'Red Planet',color:'bg-red-300'},
    {name:'Jupiter',dist:'5.2 AU',fact:'Largest planet',color:'bg-orange-200'},
    {name:'Saturn',dist:'9.5 AU',fact:'Has rings',color:'bg-yellow-300'},
    {name:'Uranus',dist:'19 AU',fact:'Rotates on side',color:'bg-teal-200'},
    {name:'Neptune',dist:'30 AU',fact:'Windiest planet',color:'bg-blue-400'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">☀️ Solar System</p>
      <div className="flex flex-col gap-1 w-full">
        {planets.map(({name,dist,fact,color},i)=>(
          <div key={name} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-4 text-right">{i+1}</span>
            <div className={`${color} border border-border rounded-full w-5 h-5 flex-shrink-0`}/>
            <div className="flex-1 flex items-center justify-between border border-border rounded px-2 py-0.5 bg-muted/30">
              <span className="text-xs font-bold">{name}</span>
              <span className="text-xs text-muted-foreground">{fact}</span>
              <span className="text-xs text-muted-foreground font-mono">{dist}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeriodicTableSimplified() {
  const elements = [
    {sym:'H',name:'Hydrogen',num:1,color:'bg-pink-200 dark:bg-pink-900/50'},
    {sym:'He',name:'Helium',num:2,color:'bg-purple-200 dark:bg-purple-900/50'},
    {sym:'Li',name:'Lithium',num:3,color:'bg-red-200 dark:bg-red-900/50'},
    {sym:'C',name:'Carbon',num:6,color:'bg-gray-200 dark:bg-gray-700/50'},
    {sym:'N',name:'Nitrogen',num:7,color:'bg-blue-200 dark:bg-blue-900/50'},
    {sym:'O',name:'Oxygen',num:8,color:'bg-blue-200 dark:bg-blue-900/50'},
    {sym:'Na',name:'Sodium',num:11,color:'bg-red-200 dark:bg-red-900/50'},
    {sym:'Fe',name:'Iron',num:26,color:'bg-orange-200 dark:bg-orange-900/50'},
    {sym:'Au',name:'Gold',num:79,color:'bg-yellow-200 dark:bg-yellow-900/50'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Common Elements</p>
      <div className="grid grid-cols-3 gap-1.5">
        {elements.map(({sym,name,num,color})=>(
          <div key={sym} className={`${color} border border-border rounded p-1 text-center w-20`}>
            <div className="text-xs text-muted-foreground">{num}</div>
            <div className="text-lg font-bold leading-tight">{sym}</div>
            <div className="text-xs text-muted-foreground truncate">{name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// HISTORY / SOCIAL STUDIES
// ══════════════════════════════════════════════════════════════

function HistoryTimeline() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Timeline</p>
      <div className="relative w-full pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border"/>
        {['First major event','Second major event','Third major event','Fourth major event'].map((desc,i)=>(
          <div key={i} className="relative flex items-start gap-3 mb-3">
            <div className="absolute -left-4 w-4 h-4 rounded-full bg-blue-500 border-2 border-background flex-shrink-0"/>
            <div className="border border-border rounded p-1.5 bg-muted/30 w-full">
              <div className="text-xs font-bold text-blue-600 dark:text-blue-400">Event {i+1}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground text-center bg-muted rounded p-1.5 w-full">Timelines show events in chronological order (earliest to latest).</div>
    </div>
  );
}

function HistoryCauseEffectChain() {
  const steps = ['Triggering Event','Short-term Effect','Long-term Consequence','Historical Impact'];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Historical Cause & Effect Chain</p>
      {steps.map((step,i)=>(
        <div key={step} className="flex flex-col items-center w-full">
          <div className={`w-full border-2 rounded-lg px-3 py-2 text-center text-xs font-semibold
            ${i===0?'border-red-400 bg-red-50 dark:bg-red-950/30':i===steps.length-1?'border-purple-400 bg-purple-50 dark:bg-purple-950/30':'border-orange-400 bg-orange-50 dark:bg-orange-950/30'}`}>{step}</div>
          {i<steps.length-1&&<div className="text-muted-foreground text-xl leading-tight">↓</div>}
        </div>
      ))}
    </div>
  );
}

function HistoryThreeBranches() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Three Branches of Government</p>
      <div className="flex gap-2">
        {[
          {name:'Legislative',icon:'🏛️',role:'Makes laws',ex:'Congress (Senate + House)',color:'border-blue-500 bg-blue-50 dark:bg-blue-950/30'},
          {name:'Executive',icon:'🦅',role:'Enforces laws',ex:'President, Cabinet',color:'border-red-500 bg-red-50 dark:bg-red-950/30'},
          {name:'Judicial',icon:'⚖️',role:'Interprets laws',ex:'Supreme Court',color:'border-green-500 bg-green-50 dark:bg-green-950/30'},
        ].map(({name,icon,role,ex,color})=>(
          <div key={name} className={`border-2 ${color} rounded-lg p-2 flex-1 text-center`}>
            <div className="text-2xl">{icon}</div>
            <div className="text-xs font-bold">{name}</div>
            <div className="text-xs text-muted-foreground">{role}</div>
            <div className="text-xs italic mt-1">{ex}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground bg-muted rounded p-1.5 text-center w-full">Checks & Balances: Each branch limits the power of the others.</div>
    </div>
  );
}

function HistoryMapCompass() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Map Skills — Cardinal Directions</p>
      <div className="relative w-28 h-28">
        <div className="absolute inset-0 rounded-full border-2 border-border bg-muted/30"/>
        {[
          {label:'N',style:{top:'2px',left:'50%',transform:'translateX(-50%)'}},
          {label:'S',style:{bottom:'2px',left:'50%',transform:'translateX(-50%)'}},
          {label:'E',style:{right:'2px',top:'50%',transform:'translateY(-50%)'}},
          {label:'W',style:{left:'2px',top:'50%',transform:'translateY(-50%)'}},
        ].map(({label,style})=>(
          <div key={label} className="absolute text-sm font-black text-blue-600 dark:text-blue-400" style={style as React.CSSProperties}>{label}</div>
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-px h-16 bg-red-500">
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rotate-45"/>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs w-full">
        {['Northeast (NE)','Northwest (NW)','Southeast (SE)','Southwest (SW)'].map(d=>(
          <div key={d} className="bg-muted rounded px-2 py-1 text-center">{d}</div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// GEOGRAPHY
// ══════════════════════════════════════════════════════════════

function GeographyContinents() {
  const continents = [
    {name:'Africa',facts:'54 countries, largest by country count'},
    {name:'Antarctica',facts:'Coldest, no permanent residents'},
    {name:'Asia',facts:'Largest by area & population'},
    {name:'Australia/Oceania',facts:'Smallest continent'},
    {name:'Europe',facts:'50 countries, second smallest'},
    {name:'North America',facts:'23 countries, includes USA/Canada/Mexico'},
    {name:'South America',facts:'12 countries, Amazon rainforest'},
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">7 Continents</p>
      {continents.map(({name,facts},i)=>(
        <div key={name} className="flex items-start gap-2 border border-border rounded p-1.5 bg-muted/30">
          <div className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">{i+1}</div>
          <div><div className="text-xs font-bold">{name}</div><div className="text-xs text-muted-foreground">{facts}</div></div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ECONOMICS
// ══════════════════════════════════════════════════════════════

function EconomicsSupplyDemand() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Supply & Demand</p>
      <div className="grid grid-cols-2 gap-3 w-full">
        <div className="border-2 border-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2">
          <div className="text-sm font-bold text-blue-700 dark:text-blue-300 text-center">📉 Demand</div>
          <div className="text-xs text-muted-foreground mt-1">↑ Price → ↓ Demand</div>
          <div className="text-xs text-muted-foreground">↓ Price → ↑ Demand</div>
          <div className="text-xs italic mt-1">Consumers want more at lower prices</div>
        </div>
        <div className="border-2 border-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg p-2">
          <div className="text-sm font-bold text-green-700 dark:text-green-300 text-center">📈 Supply</div>
          <div className="text-xs text-muted-foreground mt-1">↑ Price → ↑ Supply</div>
          <div className="text-xs text-muted-foreground">↓ Price → ↓ Supply</div>
          <div className="text-xs italic mt-1">Producers make more at higher prices</div>
        </div>
      </div>
      <div className="border-2 border-purple-400 bg-purple-50 dark:bg-purple-950/30 rounded-lg p-2 w-full text-center">
        <div className="text-xs font-bold text-purple-700 dark:text-purple-300">Equilibrium = Where Supply meets Demand</div>
        <div className="text-xs text-muted-foreground">Market price where quantity supplied = quantity demanded</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// STUDY SKILLS
// ══════════════════════════════════════════════════════════════

function StudySkillsKWL() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">KWL Chart</p>
      <div className="flex gap-2 w-full">
        {[
          {letter:'K',label:'Know',desc:'What do I already know?',color:'bg-blue-100 dark:bg-blue-900/40 border-blue-400'},
          {letter:'W',label:'Want',desc:'What do I want to learn?',color:'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-400'},
          {letter:'L',label:'Learned',desc:'What did I learn?',color:'bg-green-100 dark:bg-green-900/40 border-green-400'},
        ].map(({letter,label,desc,color})=>(
          <div key={letter} className={`border-2 ${color} rounded-lg p-2 flex-1 text-center`}>
            <div className="text-2xl font-black">{letter}</div>
            <div className="text-xs font-bold">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudySkillsConceptMap() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Concept Map</p>
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="bg-blue-500 text-white rounded-lg px-4 py-2 text-sm font-bold">Main Concept</div>
        <div className="w-px h-3 bg-foreground/40"/>
        <div className="flex gap-3">
          {['Subtopic 1','Subtopic 2','Subtopic 3'].map((s,i)=>(
            <div key={s} className="flex flex-col items-center gap-1">
              <div className="bg-green-400/80 text-green-900 dark:text-green-100 rounded px-2 py-1 text-xs font-semibold">{s}</div>
              <div className="w-px h-2 bg-foreground/40"/>
              <div className="bg-muted border border-border rounded px-1.5 py-0.5 text-xs text-muted-foreground">Detail {i+1}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground bg-muted rounded p-1.5 text-center w-full">Concept maps show how ideas connect to each other.</div>
    </div>
  );
}

function StudySkillsCornellNotes() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Cornell Notes Format</p>
      <div className="border-2 border-border rounded-lg w-full overflow-hidden text-xs">
        <div className="bg-muted px-2 py-1 font-bold border-b border-border text-center">Topic / Date</div>
        <div className="flex border-b border-border">
          <div className="w-1/3 border-r border-border p-2 bg-blue-50 dark:bg-blue-950/20">
            <div className="font-bold text-blue-700 dark:text-blue-300 mb-1">Cue Column</div>
            <div className="text-muted-foreground">Key words</div>
            <div className="text-muted-foreground">Questions</div>
            <div className="text-muted-foreground">Main ideas</div>
          </div>
          <div className="flex-1 p-2">
            <div className="font-bold mb-1">Notes Column</div>
            <div className="text-muted-foreground">Details, facts, examples</div>
            <div className="text-muted-foreground">Diagrams & definitions</div>
            <div className="text-muted-foreground">Leave space to add more</div>
          </div>
        </div>
        <div className="p-2 bg-yellow-50 dark:bg-yellow-950/20">
          <div className="font-bold text-yellow-700 dark:text-yellow-300 mb-0.5">Summary (bottom)</div>
          <div className="text-muted-foreground">Write 2–3 sentences in your own words summarizing the main points.</div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// VISUAL RENDERER + LABELS
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// COLLEGE / ADVANCED VISUAL COMPONENTS
// Paste these BEFORE the renderVisual() function
// ══════════════════════════════════════════════════════════════

// ─── MATH — CALCULUS ──────────────────────────────────────────

function MathCalculusDerivatives() {
  const rules = [
    { rule: 'Constant', f: 'c', d: '0' },
    { rule: 'Power', f: 'xⁿ', d: 'nxⁿ⁻¹' },
    { rule: 'Sum', f: 'f + g', d: "f' + g'" },
    { rule: 'Product', f: 'f · g', d: "f'g + fg'" },
    { rule: 'Quotient', f: 'f/g', d: "(f'g − fg')/g²" },
    { rule: 'Chain', f: 'f(g(x))', d: "f'(g(x))·g'(x)" },
    { rule: 'sin x', f: 'sin x', d: 'cos x' },
    { rule: 'cos x', f: 'cos x', d: '−sin x' },
    { rule: 'eˣ', f: 'eˣ', d: 'eˣ' },
    { rule: 'ln x', f: 'ln x', d: '1/x' },
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Derivative Rules</p>
      <table className="w-full text-xs border-collapse">
        <thead><tr className="bg-blue-100 dark:bg-blue-900/40">
          <th className="border border-border px-2 py-1 text-left">Rule</th>
          <th className="border border-border px-2 py-1 text-left">f(x)</th>
          <th className="border border-border px-2 py-1 text-left font-mono">f'(x)</th>
        </tr></thead>
        <tbody>{rules.map(({rule,f,d},i)=>(
          <tr key={rule} className={i%2===0?'bg-muted/30':''}>
            <td className="border border-border px-2 py-1 font-bold text-blue-700 dark:text-blue-300">{rule}</td>
            <td className="border border-border px-2 py-1 font-mono">{f}</td>
            <td className="border border-border px-2 py-1 font-mono text-green-700 dark:text-green-400">{d}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function MathCalculusIntegrals() {
  const rules = [
    { f: '∫ c dx', r: 'cx + C' },
    { f: '∫ xⁿ dx', r: 'xⁿ⁺¹/(n+1) + C' },
    { f: '∫ eˣ dx', r: 'eˣ + C' },
    { f: '∫ 1/x dx', r: 'ln|x| + C' },
    { f: '∫ sin x dx', r: '−cos x + C' },
    { f: '∫ cos x dx', r: 'sin x + C' },
    { f: '∫ sec²x dx', r: 'tan x + C' },
    { f: '∫ aˣ dx', r: 'aˣ/ln(a) + C' },
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Common Integrals</p>
      <div className="grid grid-cols-2 gap-1.5 w-full">
        {rules.map(({f,r})=>(
          <div key={f} className="border border-border rounded p-2 bg-muted/30">
            <div className="text-xs font-mono font-bold text-purple-700 dark:text-purple-300">{f}</div>
            <div className="text-xs font-mono text-green-700 dark:text-green-400 mt-0.5">= {r}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground bg-muted rounded p-1.5 w-full text-center">C = constant of integration</div>
    </div>
  );
}

function MathLimits() {
  const rules = [
    { name: 'Definition', val: 'lim f(x) = L as x→a' },
    { name: 'L\'Hôpital\'s', val: 'If 0/0 or ∞/∞: take f\'(x)/g\'(x)' },
    { name: 'lim sin(x)/x', val: '= 1 as x→0' },
    { name: 'lim (1+1/n)ⁿ', val: '= e as n→∞' },
    { name: 'Squeeze Thm', val: 'g≤f≤h, lim g=lim h=L → lim f=L' },
    { name: '∞ behavior', val: 'lim 1/x = 0 as x→∞' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Limits Reference</p>
      {rules.map(({name,val})=>(
        <div key={name} className="border-l-4 border-purple-400 pl-2 py-0.5">
          <span className="text-xs font-bold text-purple-700 dark:text-purple-300">{name}: </span>
          <span className="text-xs font-mono text-foreground">{val}</span>
        </div>
      ))}
    </div>
  );
}

function MathLinearAlgebra() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Linear Algebra Essentials</p>
      <div className="grid grid-cols-2 gap-2 w-full text-xs">
        <div className="border border-border rounded p-2 bg-blue-50 dark:bg-blue-950/30">
          <div className="font-bold text-blue-700 dark:text-blue-300 mb-1">Matrix Multiply</div>
          <div className="font-mono">[A]ₘₓₙ · [B]ₙₓₚ = [C]ₘₓₚ</div>
          <div className="text-muted-foreground mt-1">Inner dims must match</div>
        </div>
        <div className="border border-border rounded p-2 bg-green-50 dark:bg-green-950/30">
          <div className="font-bold text-green-700 dark:text-green-300 mb-1">Determinant 2×2</div>
          <div className="font-mono">|ad − bc|</div>
          <div className="font-mono text-muted-foreground">for [[a,b],[c,d]]</div>
        </div>
        <div className="border border-border rounded p-2 bg-purple-50 dark:bg-purple-950/30">
          <div className="font-bold text-purple-700 dark:text-purple-300 mb-1">Eigenvalues</div>
          <div className="font-mono">det(A − λI) = 0</div>
          <div className="text-muted-foreground mt-1">Av = λv</div>
        </div>
        <div className="border border-border rounded p-2 bg-orange-50 dark:bg-orange-950/30">
          <div className="font-bold text-orange-700 dark:text-orange-300 mb-1">Dot Product</div>
          <div className="font-mono">a·b = |a||b|cos θ</div>
          <div className="text-muted-foreground mt-1">= Σ aᵢbᵢ</div>
        </div>
      </div>
    </div>
  );
}

function MathProbabilityStats() {
  const formulas = [
    { label: 'P(A or B)', f: 'P(A) + P(B) − P(A∩B)' },
    { label: 'P(A and B)', f: 'P(A) · P(B|A)' },
    { label: 'Bayes\'s', f: 'P(A|B) = P(B|A)P(A)/P(B)' },
    { label: 'Mean μ', f: 'Σx / n' },
    { label: 'Std Dev σ', f: '√[Σ(x−μ)²/n]' },
    { label: 'Z-score', f: 'z = (x − μ) / σ' },
    { label: 'Combinations', f: 'C(n,k) = n! / k!(n−k)!' },
    { label: 'Normal Rule', f: '68 / 95 / 99.7%' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Probability & Statistics</p>
      {formulas.map(({label,f})=>(
        <div key={label} className="flex items-center gap-2 border-b border-border/40 pb-1">
          <span className="text-xs font-bold text-blue-700 dark:text-blue-300 w-28 shrink-0">{label}</span>
          <span className="text-xs font-mono text-foreground">{f}</span>
        </div>
      ))}
    </div>
  );
}

function MathLogarithms() {
  const rules = [
    { name: 'Definition', r: 'logₐ(x) = y ↔ aʸ = x' },
    { name: 'Product', r: 'logₐ(xy) = logₐx + logₐy' },
    { name: 'Quotient', r: 'logₐ(x/y) = logₐx − logₐy' },
    { name: 'Power', r: 'logₐ(xⁿ) = n·logₐx' },
    { name: 'Change of Base', r: 'logₐx = log x / log a' },
    { name: 'Natural log', r: 'ln(eˣ) = x, e^(ln x) = x' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Logarithm Rules</p>
      {rules.map(({name,r})=>(
        <div key={name} className="border-l-4 border-yellow-400 pl-2 py-0.5">
          <div className="text-xs font-bold text-yellow-700 dark:text-yellow-300">{name}</div>
          <div className="text-xs font-mono">{r}</div>
        </div>
      ))}
    </div>
  );
}

// ─── LANGUAGES ────────────────────────────────────────────────

function LangGermanAlphabet() {
  const letters = [
    {l:'A',p:'ah'},{l:'B',p:'bay'},{l:'C',p:'tsay'},{l:'D',p:'day'},
    {l:'E',p:'ay'},{l:'F',p:'eff'},{l:'G',p:'gay'},{l:'H',p:'hah'},
    {l:'I',p:'ee'},{l:'J',p:'yot'},{l:'K',p:'kah'},{l:'L',p:'ell'},
    {l:'M',p:'em'},{l:'N',p:'en'},{l:'O',p:'oh'},{l:'P',p:'pay'},
    {l:'Q',p:'koo'},{l:'R',p:'err'},{l:'S',p:'ess'},{l:'T',p:'tay'},
    {l:'U',p:'oo'},{l:'V',p:'fow'},{l:'W',p:'vay'},{l:'X',p:'iks'},
    {l:'Y',p:'oopsilon'},{l:'Z',p:'tset'},
  ];
  const special = [
    {l:'Ä',p:'like "air"'},{l:'Ö',p:'like "ur"'},{l:'Ü',p:'like "oo" rounded'},{l:'ß',p:'"ss" sound'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">German Alphabet</p>
      <div className="grid grid-cols-6 gap-1 w-full">
        {letters.map(({l,p})=>(
          <div key={l} className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 rounded p-1 text-center">
            <div className="text-sm font-black">{l}</div>
            <div className="text-muted-foreground" style={{fontSize:'9px'}}>{p}</div>
          </div>
        ))}
      </div>
      <div className="w-full">
        <div className="text-xs font-bold text-muted-foreground mb-1">Special Characters (Umlauts)</div>
        <div className="grid grid-cols-4 gap-1">
          {special.map(({l,p})=>(
            <div key={l} className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 rounded p-1 text-center">
              <div className="text-sm font-black text-orange-700 dark:text-orange-300">{l}</div>
              <div className="text-muted-foreground" style={{fontSize:'9px'}}>{p}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LangKoreanHangul() {
  const consonants = [
    {l:'ㄱ',p:'g/k'},{l:'ㄴ',p:'n'},{l:'ㄷ',p:'d/t'},{l:'ㄹ',p:'r/l'},
    {l:'ㅁ',p:'m'},{l:'ㅂ',p:'b/p'},{l:'ㅅ',p:'s'},{l:'ㅇ',p:'ng'},
    {l:'ㅈ',p:'j'},{l:'ㅊ',p:'ch'},{l:'ㅋ',p:'k'},{l:'ㅌ',p:'t'},
    {l:'ㅍ',p:'p'},{l:'ㅎ',p:'h'},
  ];
  const vowels = [
    {l:'ㅏ',p:'a'},{l:'ㅓ',p:'eo'},{l:'ㅗ',p:'o'},{l:'ㅜ',p:'u'},
    {l:'ㅡ',p:'eu'},{l:'ㅣ',p:'i'},{l:'ㅐ',p:'ae'},{l:'ㅔ',p:'e'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Korean Hangul</p>
      <div className="w-full">
        <div className="text-xs font-bold text-muted-foreground mb-1">Consonants (자음)</div>
        <div className="grid grid-cols-7 gap-1">
          {consonants.map(({l,p})=>(
            <div key={l} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 rounded p-1 text-center">
              <div className="text-sm font-black">{l}</div>
              <div className="text-muted-foreground" style={{fontSize:'9px'}}>{p}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="w-full">
        <div className="text-xs font-bold text-muted-foreground mb-1">Vowels (모음)</div>
        <div className="grid grid-cols-8 gap-1">
          {vowels.map(({l,p})=>(
            <div key={l} className="bg-pink-50 dark:bg-pink-900/20 border border-pink-300 rounded p-1 text-center">
              <div className="text-sm font-black">{l}</div>
              <div className="text-muted-foreground" style={{fontSize:'9px'}}>{p}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground bg-muted rounded p-1.5 w-full text-center">Syllables: consonant + vowel (e.g. ㅎ+ㅏ = 하 "ha")</div>
    </div>
  );
}

function LangArabicAlphabet() {
  const letters = [
    {l:'ا',name:'Alif',p:'a'},{l:'ب',name:'Ba',p:'b'},{l:'ت',name:'Ta',p:'t'},
    {l:'ث',name:'Tha',p:'th'},{l:'ج',name:'Jim',p:'j'},{l:'ح',name:'Ha',p:'h'},
    {l:'خ',name:'Kha',p:'kh'},{l:'د',name:'Dal',p:'d'},{l:'ذ',name:'Dhal',p:'dh'},
    {l:'ر',name:'Ra',p:'r'},{l:'ز',name:'Zay',p:'z'},{l:'س',name:'Sin',p:'s'},
    {l:'ش',name:'Shin',p:'sh'},{l:'ص',name:'Sad',p:'ṣ'},{l:'ض',name:'Dad',p:'ḍ'},
    {l:'ط',name:'Ta',p:'ṭ'},{l:'ظ',name:'Dha',p:'ẓ'},{l:'ع',name:'Ain',p:"'"},{l:'غ',name:'Ghain',p:'gh'},
    {l:'ف',name:'Fa',p:'f'},{l:'ق',name:'Qaf',p:'q'},{l:'ك',name:'Kaf',p:'k'},
    {l:'ل',name:'Lam',p:'l'},{l:'م',name:'Mim',p:'m'},{l:'ن',name:'Nun',p:'n'},
    {l:'ه',name:'Ha',p:'h'},{l:'و',name:'Waw',p:'w'},{l:'ي',name:'Ya',p:'y'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Arabic Alphabet (الأبجدية)</p>
      <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/20 rounded p-1.5 w-full text-center">Read right to left • Letters change shape based on position</div>
      <div className="grid grid-cols-4 gap-1 w-full">
        {letters.map(({l,name,p})=>(
          <div key={name+l} className="bg-muted/40 border border-border rounded p-1 flex items-center gap-1.5">
            <span className="text-lg font-black text-amber-700 dark:text-amber-300">{l}</span>
            <div>
              <div className="text-xs font-bold leading-none">{name}</div>
              <div className="text-muted-foreground leading-none" style={{fontSize:'9px'}}>{p}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LangRussianCyrillic() {
  const letters = [
    {l:'А',p:'a'},{l:'Б',p:'b'},{l:'В',p:'v'},{l:'Г',p:'g'},{l:'Д',p:'d'},
    {l:'Е',p:'ye'},{l:'Ё',p:'yo'},{l:'Ж',p:'zh'},{l:'З',p:'z'},{l:'И',p:'i'},
    {l:'Й',p:'y'},{l:'К',p:'k'},{l:'Л',p:'l'},{l:'М',p:'m'},{l:'Н',p:'n'},
    {l:'О',p:'o'},{l:'П',p:'p'},{l:'Р',p:'r'},{l:'С',p:'s'},{l:'Т',p:'t'},
    {l:'У',p:'u'},{l:'Ф',p:'f'},{l:'Х',p:'kh'},{l:'Ц',p:'ts'},{l:'Ч',p:'ch'},
    {l:'Ш',p:'sh'},{l:'Щ',p:'shch'},{l:'Ъ',p:'hard'},{l:'Ы',p:'ы'},{l:'Ь',p:'soft'},
    {l:'Э',p:'e'},{l:'Ю',p:'yu'},{l:'Я',p:'ya'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Russian Cyrillic Alphabet</p>
      <div className="grid grid-cols-6 gap-1 w-full">
        {letters.map(({l,p})=>(
          <div key={l} className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded p-1 text-center">
            <div className="text-sm font-black text-red-700 dark:text-red-300">{l}</div>
            <div className="text-muted-foreground" style={{fontSize:'9px'}}>{p}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LangJapaneseKatakana() {
  const kana = [
    {k:'ア',r:'a'},{k:'イ',r:'i'},{k:'ウ',r:'u'},{k:'エ',r:'e'},{k:'オ',r:'o'},
    {k:'カ',r:'ka'},{k:'キ',r:'ki'},{k:'ク',r:'ku'},{k:'ケ',r:'ke'},{k:'コ',r:'ko'},
    {k:'サ',r:'sa'},{k:'シ',r:'shi'},{k:'ス',r:'su'},{k:'セ',r:'se'},{k:'ソ',r:'so'},
    {k:'タ',r:'ta'},{k:'チ',r:'chi'},{k:'ツ',r:'tsu'},{k:'テ',r:'te'},{k:'ト',r:'to'},
    {k:'ナ',r:'na'},{k:'ニ',r:'ni'},{k:'ヌ',r:'nu'},{k:'ネ',r:'ne'},{k:'ノ',r:'no'},
    {k:'ハ',r:'ha'},{k:'ヒ',r:'hi'},{k:'フ',r:'fu'},{k:'ヘ',r:'he'},{k:'ホ',r:'ho'},
    {k:'マ',r:'ma'},{k:'ミ',r:'mi'},{k:'ム',r:'mu'},{k:'メ',r:'me'},{k:'モ',r:'mo'},
    {k:'ヤ',r:'ya'},{k:'ユ',r:'yu'},{k:'ヨ',r:'yo'},
    {k:'ラ',r:'ra'},{k:'リ',r:'ri'},{k:'ル',r:'ru'},{k:'レ',r:'re'},{k:'ロ',r:'ro'},
    {k:'ワ',r:'wa'},{k:'ヲ',r:'wo'},{k:'ン',r:'n'},
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Japanese Katakana (for foreign words)</p>
      <div className="grid grid-cols-5 gap-1 w-full">
        {kana.map(({k,r})=>(
          <div key={k} className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded p-1 text-center">
            <div className="text-base font-black text-red-700 dark:text-red-300">{k}</div>
            <div className="text-muted-foreground" style={{fontSize:'9px'}}>{r}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LangSpanishVerbConjugation() {
  const verbs = [
    { v: 'hablar (to speak)', conj: ['hablo','hablas','habla','hablamos','habláis','hablan'] },
    { v: 'ser (to be – perm)', conj: ['soy','eres','es','somos','sois','son'] },
    { v: 'estar (to be – temp)', conj: ['estoy','estás','está','estamos','estáis','están'] },
    { v: 'tener (to have)', conj: ['tengo','tienes','tiene','tenemos','tenéis','tienen'] },
  ];
  const pronouns = ['yo','tú','él/ella','nosotros','vosotros','ellos'];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Spanish Verb Conjugation (Present)</p>
      {verbs.map(({v,conj})=>(
        <div key={v} className="border border-border rounded p-1.5">
          <div className="text-xs font-bold text-green-700 dark:text-green-400 mb-1">{v}</div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
            {pronouns.map((pr,i)=>(
              <div key={pr} className="flex gap-1 text-xs">
                <span className="text-muted-foreground w-16">{pr}</span>
                <span className="font-semibold">{conj[i]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LangFrenchVerbConjugation() {
  const verbs = [
    { v: 'parler (to speak)', conj: ['parle','parles','parle','parlons','parlez','parlent'] },
    { v: 'être (to be)', conj: ['suis','es','est','sommes','êtes','sont'] },
    { v: 'avoir (to have)', conj: ['ai','as','a','avons','avez','ont'] },
    { v: 'aller (to go)', conj: ['vais','vas','va','allons','allez','vont'] },
  ];
  const pronouns = ['je','tu','il/elle','nous','vous','ils/elles'];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">French Verb Conjugation (Present)</p>
      {verbs.map(({v,conj})=>(
        <div key={v} className="border border-border rounded p-1.5">
          <div className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">{v}</div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
            {pronouns.map((pr,i)=>(
              <div key={pr} className="flex gap-1 text-xs">
                <span className="text-muted-foreground w-16">{pr}</span>
                <span className="font-semibold">{conj[i]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LangChineseTones() {
  const tones = [
    { num: '1st', mark: 'ā', name: 'High Level', desc: 'Flat and high', ex: 'mā (妈 mother)', color: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' },
    { num: '2nd', mark: 'á', name: 'Rising', desc: 'Goes up (like a question)', ex: 'má (麻 hemp)', color: 'border-green-400 bg-green-50 dark:bg-green-900/20' },
    { num: '3rd', mark: 'ǎ', name: 'Dipping', desc: 'Falls then rises', ex: 'mǎ (马 horse)', color: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' },
    { num: '4th', mark: 'à', name: 'Falling', desc: 'Sharp fall', ex: 'mà (骂 scold)', color: 'border-red-400 bg-red-50 dark:bg-red-900/20' },
    { num: '5th', mark: 'a', name: 'Neutral', desc: 'Short, unstressed', ex: 'ma (吗 question)', color: 'border-gray-400 bg-gray-50 dark:bg-gray-900/20' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Mandarin Chinese Tones</p>
      {tones.map(({num,mark,name,desc,ex,color})=>(
        <div key={num} className={`border-l-4 ${color} rounded-r px-2 py-1.5 flex items-start gap-3`}>
          <span className="text-2xl font-black w-8 text-center">{mark}</span>
          <div>
            <div className="text-xs font-bold">{num} Tone — {name}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
            <div className="text-xs italic">{ex}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── GEOGRAPHY — MAPS ─────────────────────────────────────────

function GeographyUSAMap() {
  const regions = [
    { name: 'Northeast', color: '#5b9bd5' },
    { name: 'Southeast', color: '#4a9e6b' },
    { name: 'Midwest', color: '#9b7fd4' },
    { name: 'Southwest', color: '#e8a838' },
    { name: 'West', color: '#e05c5c' },
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">United States — All 50 States</p>
      <div className="w-full rounded overflow-hidden border border-border" style={{background:'#b3d1e8'}}>
        <img src="/maps/usa.svg" alt="US States Map" style={{display:"block", width:"100%", height:"auto", maxHeight:"380px", objectFit:"contain"}}/>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {regions.map(({name,color})=>(
          <div key={name} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{background:color}}/>
            <span className="text-muted-foreground" style={{fontSize:'9px'}}>{name}</span>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground text-center" style={{fontSize:'9px'}}>50 states • Capital: Washington D.C.</div>
    </div>
  );
}

function GeographyWorldMap() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">World Map</p>
      <div className="w-full rounded overflow-hidden border border-border" style={{background:'#b3d1e8'}}>
        <img src="/maps/world.svg" alt="World Map" style={{display:"block", width:"100%", height:"auto", maxHeight:"380px", objectFit:"contain"}}/>
      </div>
      <div className="grid grid-cols-4 gap-1 w-full text-center" style={{fontSize:'9px'}}>
        <div className="bg-muted rounded py-0.5 text-muted-foreground">7 Continents</div>
        <div className="bg-muted rounded py-0.5 text-muted-foreground">195 Countries</div>
        <div className="bg-muted rounded py-0.5 text-muted-foreground">8B People</div>
        <div className="bg-muted rounded py-0.5 text-muted-foreground">5 Oceans</div>
      </div>
    </div>
  );
}

function GeographyEuropeMap() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Europe — Countries & Capitals</p>
      <div className="w-full rounded overflow-hidden border border-border" style={{background:'#b3d1e8'}}>
        <img src="/maps/europe.svg" alt="Europe Map" style={{display:"block", width:"100%", height:"auto", maxHeight:"380px", objectFit:"contain"}}/>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 w-full" style={{fontSize:'9px'}}>
        {['Germany (Berlin)','France (Paris)','UK (London)','Italy (Rome)','Spain (Madrid)',
          'Poland (Warsaw)','Ukraine (Kyiv)','Netherlands (Amsterdam)','Belgium (Brussels)',
          'Sweden (Stockholm)','Norway (Oslo)','Greece (Athens)','Portugal (Lisbon)',
          'Austria (Vienna)','Switzerland (Bern)','Romania (Bucharest)'].map(c=>(
          <div key={c} className="flex items-center gap-1 text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"/>
            <span className="truncate">{c}</span>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground text-center" style={{fontSize:'9px'}}>44 countries • EU has 27 member states</div>
    </div>
  );
}

function GeographyAfricaMap() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Africa — Countries</p>
      <div className="w-full rounded overflow-hidden border border-border" style={{background:'#b3d1e8', maxHeight:'320px'}}>
        <img src="/maps/africa.svg" alt="Africa Map" style={{display:"block", width:"100%", height:"auto", maxHeight:"380px", objectFit:"contain"}}/>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 w-full" style={{fontSize:'9px'}}>
        {['Nigeria (Abuja)','Ethiopia (Addis Ababa)','Egypt (Cairo)','South Africa (Pretoria)',
          'Kenya (Nairobi)','Tanzania (Dodoma)','Algeria (Algiers)','Morocco (Rabat)',
          'Ghana (Accra)','Angola (Luanda)','Sudan (Khartoum)','Madagascar (Antananarivo)'].map(c=>(
          <div key={c} className="text-muted-foreground truncate">{c}</div>
        ))}
      </div>
      <div className="text-muted-foreground text-center" style={{fontSize:'9px'}}>54 countries • Largest continent by country count</div>
    </div>
  );
}

function GeographyNorthAmericaMap() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">North America</p>
      <svg viewBox="0 0 520 570" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        <rect width="520" height="570" fill="#b3d1e8" rx="6"/>
        {/* Greenland */}
        <path d="M298,15 L358,8 L395,18 L408,38 L398,58 L375,68 L348,65 L322,52 L302,35 Z" fill="#d0eaf8" stroke="#8ab8d8" strokeWidth="1"/>
        <text x="352" y="40" fontSize="7.5" fill="#1a3a5c" textAnchor="middle" fontWeight="bold">GREENLAND</text>
        <text x="352" y="50" fontSize="6" fill="#3a6a8c" textAnchor="middle">(Denmark)</text>
        {/* Canada */}
        <path d="M82,30 L175,22 L262,28 L315,35 L342,52 L346,75 L330,88 L305,85 L278,95 L258,88 L238,95 L218,88 L195,95 L175,88 L155,95 L138,88 L118,98 L100,90 L80,98 L65,88 L55,72 L58,52 Z" fill="#e8c87a" stroke="#c4a030" strokeWidth="1"/>
        <path d="M315,35 L388,30 L415,42 L420,62 L405,78 L385,82 L365,75 L345,80 L332,72 L330,88 L342,75 Z" fill="#e8c87a" stroke="#c4a030" strokeWidth="1"/>
        <path d="M415,55 L432,48 L442,58 L438,72 L422,75 L412,65 Z" fill="#e8c87a" stroke="#c4a030" strokeWidth="1"/>
        {/* Alaska */}
        <path d="M28,52 L70,45 L82,55 L80,72 L62,82 L42,78 L26,65 Z" fill="#d4845a" stroke="#904020" strokeWidth="1"/>
        <path d="M16,78 L26,75 L33,80 L26,86 L16,83 Z" fill="#d4845a" stroke="#904020" strokeWidth="1"/>
        {/* USA */}
        <path d="M78,98 L138,92 L155,98 L175,92 L195,98 L218,92 L238,98 L258,92 L278,98 L305,88 L330,92 L346,108 L348,132 L342,155 L328,172 L315,182 L295,185 L272,188 L248,185 L225,188 L205,185 L182,188 L160,182 L140,172 L125,158 L112,142 L98,125 L82,112 Z" fill="#d4845a" stroke="#904020" strokeWidth="1"/>
        {/* Florida */}
        <path d="M295,182 L308,178 L318,188 L315,212 L305,228 L292,232 L278,220 L276,205 L282,192 Z" fill="#d4845a" stroke="#904020" strokeWidth="1"/>
        {/* Mexico */}
        <path d="M110,188 L182,185 L208,192 L222,208 L225,228 L212,248 L195,262 L175,268 L155,260 L140,245 L125,228 L115,210 Z" fill="#7ac47a" stroke="#3a943a" strokeWidth="1"/>
        {/* Baja */}
        <path d="M70,188 L90,182 L102,192 L105,215 L95,238 L80,248 L65,238 L60,215 L62,198 Z" fill="#7ac47a" stroke="#3a943a" strokeWidth="1"/>
        {/* Central America */}
        <path d="M175,268 L198,262 L212,272 L215,288 L205,298 L190,302 L175,292 L170,280 Z" fill="#7ac47a" stroke="#3a943a" strokeWidth="1"/>
        {/* Cuba */}
        <path d="M255,248 L292,242 L305,250 L302,262 L282,268 L258,262 Z" fill="#9b9bd4" stroke="#5050a0" strokeWidth="0.8"/>
        {/* Hawaii inset */}
        <rect x="28" y="425" width="105" height="52" fill="#7ab8d4" rx="3" opacity="0.5"/>
        <ellipse cx="46" cy="453" rx="7" ry="5" fill="#d4845a" stroke="#904020" strokeWidth="0.8"/>
        <ellipse cx="60" cy="448" rx="9" ry="6" fill="#d4845a" stroke="#904020" strokeWidth="0.8"/>
        <ellipse cx="76" cy="447" rx="8" ry="5" fill="#d4845a" stroke="#904020" strokeWidth="0.8"/>
        <ellipse cx="90" cy="451" rx="7" ry="5" fill="#d4845a" stroke="#904020" strokeWidth="0.8"/>
        <ellipse cx="104" cy="455" rx="9" ry="6" fill="#d4845a" stroke="#904020" strokeWidth="0.8"/>
        <text x="65" y="470" fontSize="6.5" fill="#1a3a5c" textAnchor="middle">Hawaii</text>
        {/* Labels */}
        <text x="212" y="62" fontSize="11" fill="#5a3a00" textAnchor="middle" fontWeight="bold">CANADA</text>
        <text x="48" y="65" fontSize="7" fill="#5a2800" textAnchor="middle" fontWeight="bold">AK</text>
        <text x="210" y="142" fontSize="10" fill="#5a2800" textAnchor="middle" fontWeight="bold">UNITED STATES</text>
        <text x="160" y="225" fontSize="9" fill="#1a4a1a" textAnchor="middle" fontWeight="bold">MEXICO</text>
        <text x="190" y="283" fontSize="7" fill="#1a4a1a" textAnchor="middle">C. AMERICA</text>
        <text x="278" y="257" fontSize="7" fill="#2a2a6a" textAnchor="middle">CUBA</text>
        <text x="35" y="315" fontSize="8" fill="#4a7a9a" textAnchor="middle" transform="rotate(-90,35,315)">PACIFIC OCEAN</text>
        <text x="468" y="200" fontSize="8" fill="#4a7a9a" textAnchor="middle" transform="rotate(90,468,200)">ATLANTIC OCEAN</text>
        <text x="262" y="340" fontSize="7.5" fill="#4a7a9a" textAnchor="middle">Gulf of Mexico</text>
        {/* Legend */}
        <rect x="355" y="415" width="11" height="9" fill="#d0eaf8" rx="1"/>
        <text x="370" y="423" fontSize="7" fill="#999">Greenland</text>
        <rect x="355" y="428" width="11" height="9" fill="#e8c87a" rx="1"/>
        <text x="370" y="436" fontSize="7" fill="#999">Canada</text>
        <rect x="355" y="441" width="11" height="9" fill="#d4845a" rx="1"/>
        <text x="370" y="449" fontSize="7" fill="#999">USA / Alaska</text>
        <rect x="355" y="454" width="11" height="9" fill="#7ac47a" rx="1"/>
        <text x="370" y="462" fontSize="7" fill="#999">Mexico / C. America</text>
      </svg>
      <div className="text-muted-foreground text-center" style={{fontSize:'9px'}}>3 major countries • 23 total nations • ~600M population</div>
    </div>
  );
}

function GeographyAsiaMap() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Asia Map</p>
      <svg viewBox="0 0 700 560" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        <rect width="700" height="560" fill="#b3d1e8" rx="6"/>
        <path d="M50,25 L680,20 L685,85 L640,95 L580,88 L520,90 L460,85 L400,88 L340,82 L280,85 L220,80 L160,82 L105,78 L55,82 Z" fill="#e8a838" stroke="#c47820" strokeWidth="1"/>
        <path d="M52,148 L125,135 L148,142 L155,162 L138,175 L100,180 L65,172 L48,158 Z" fill="#9b7fd4" stroke="#6040b0" strokeWidth="1"/>
        <path d="M148,130 L178,125 L192,135 L188,150 L168,155 L148,148 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="0.8"/>
        <path d="M122,175 L155,168 L165,182 L158,200 L135,205 L118,195 Z" fill="#5b9bd5" stroke="#2060a0" strokeWidth="0.8"/>
        <path d="M142,168 L185,162 L195,178 L190,205 L168,212 L145,205 L138,188 Z" fill="#e8c87a" stroke="#a08020" strokeWidth="0.8"/>
        <path d="M178,142 L248,132 L268,148 L272,175 L255,198 L222,208 L192,202 L178,182 L172,160 Z" fill="#4a9e6b" stroke="#206040" strokeWidth="1"/>
        <path d="M122,202 L168,198 L195,205 L208,222 L215,248 L208,272 L192,285 L168,290 L145,278 L128,258 L118,235 L115,215 Z" fill="#e8c87a" stroke="#a08020" strokeWidth="1"/>
        <path d="M248,142 L312,132 L328,148 L325,172 L305,185 L272,182 L255,165 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="0.8"/>
        <path d="M268,172 L328,165 L345,180 L342,205 L320,218 L292,222 L268,210 L258,192 Z" fill="#d4845a" stroke="#904020" strokeWidth="0.8"/>
        <path d="M298,218 L358,208 L375,222 L382,248 L375,278 L358,305 L338,318 L315,308 L295,285 L288,258 L292,232 Z" fill="#5b9bd5" stroke="#2060a0" strokeWidth="1"/>
        <path d="M345,318 L360,312 L368,322 L362,338 L346,335 Z" fill="#5b9bd5" stroke="#2060a0" strokeWidth="0.8"/>
        <path d="M358,218 L385,212 L392,228 L385,245 L362,248 L355,232 Z" fill="#4a9e6b" stroke="#206040" strokeWidth="0.8"/>
        <path d="M320,205 L365,200 L372,212 L340,218 L315,215 Z" fill="#e8a838" stroke="#a06010" strokeWidth="0.8"/>
        <path d="M195,88 L368,82 L375,112 L362,138 L328,142 L278,138 L228,132 L195,118 Z" fill="#9b7fd4" stroke="#6040b0" strokeWidth="1"/>
        <path d="M228,132 L298,128 L312,142 L305,162 L272,168 L238,158 L225,145 Z" fill="#e8c87a" stroke="#a08020" strokeWidth="0.8"/>
        <path d="M368,85 L560,78 L578,95 L585,122 L578,158 L558,182 L528,198 L498,205 L468,198 L438,185 L412,168 L395,148 L388,125 L378,108 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="1"/>
        <path d="M368,85 L532,80 L538,108 L495,118 L432,115 L380,110 Z" fill="#e8a838" stroke="#a06010" strokeWidth="1"/>
        <path d="M345,155 L415,148 L425,168 L408,185 L368,188 L345,175 Z" fill="#c85050" stroke="#a02020" strokeWidth="0.8" opacity="0.7"/>
        <path d="M458,195 L495,188 L508,205 L505,235 L488,255 L465,258 L448,242 L445,218 Z" fill="#4a9e6b" stroke="#206040" strokeWidth="0.8"/>
        <path d="M498,198 L532,192 L545,208 L542,238 L525,258 L505,262 L492,248 L495,225 Z" fill="#9b7fd4" stroke="#6040b0" strokeWidth="0.8"/>
        <path d="M488,258 L512,252 L522,265 L515,285 L498,290 L485,278 Z" fill="#e8a838" stroke="#a06010" strokeWidth="0.8"/>
        <path d="M462,298 L512,285 L535,295 L532,315 L505,322 L468,318 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="0.8"/>
        <path d="M572,195 L592,185 L605,198 L600,222 L582,232 L568,218 Z" fill="#5b9bd5" stroke="#2060a0" strokeWidth="0.8"/>
        <path d="M605,108 L628,98 L642,108 L638,132 L622,142 L605,132 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="0.8"/>
        <path d="M605,88 L625,80 L638,90 L628,102 L608,100 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="0.8"/>
        <path d="M612,138 L628,132 L635,142 L628,152 L612,150 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="0.8"/>
        <path d="M562,115 L585,110 L592,128 L582,148 L562,152 L552,135 Z" fill="#9b7fd4" stroke="#6040b0" strokeWidth="0.8"/>
        <path d="M572,165 L585,160 L592,172 L585,185 L572,182 Z" fill="#5b9bd5" stroke="#2060a0" strokeWidth="0.8"/>
        <text x="368" y="52" fontSize="10" fill="white" textAnchor="middle" fontWeight="bold">RUSSIA (Siberia)</text>
        <text x="98" y="158" fontSize="7.5" fill="white" textAnchor="middle" fontWeight="bold">TURKEY</text>
        <text x="222" y="172" fontSize="7.5" fill="white" textAnchor="middle" fontWeight="bold">IRAN</text>
        <text x="165" y="248" fontSize="8" fill="#5a4000" textAnchor="middle" fontWeight="bold">ARABIA</text>
        <text x="295" y="162" fontSize="7" fill="white" textAnchor="middle">AFG</text>
        <text x="305" y="198" fontSize="7" fill="white" textAnchor="middle">PAK</text>
        <text x="335" y="265" fontSize="9" fill="white" textAnchor="middle" fontWeight="bold">INDIA</text>
        <text x="288" y="112" fontSize="8" fill="white" textAnchor="middle">KAZAKH.</text>
        <text x="268" y="150" fontSize="7" fill="#3a2800" textAnchor="middle">C. ASIA</text>
        <text x="480" y="142" fontSize="11" fill="white" textAnchor="middle" fontWeight="bold">CHINA</text>
        <text x="452" y="100" fontSize="8" fill="#3a2800" textAnchor="middle">MONGOLIA</text>
        <text x="478" y="228" fontSize="7" fill="white" textAnchor="middle">SE ASIA</text>
        <text x="585" y="210" fontSize="6.5" fill="white" textAnchor="middle">PHIL.</text>
        <text x="622" y="118" fontSize="7.5" fill="white" textAnchor="middle" fontWeight="bold">JAPAN</text>
        <text x="572" y="132" fontSize="6.5" fill="white" textAnchor="middle">KOREA</text>
        <text x="645" y="320" fontSize="9" fill="#4a7a9a" textAnchor="middle" transform="rotate(90,645,320)">PACIFIC OCEAN</text>
        <text x="350" y="540" fontSize="9" fill="#4a7a9a" textAnchor="middle">Indian Ocean</text>
        <text x="350" y="505" fontSize="8" fill="#888" textAnchor="middle">48 countries • 4.7 billion people • Largest continent</text>
      </svg>
    </div>
  );
}

function GeographyGreenlandMap() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Greenland</p>
      <svg viewBox="0 0 400 500" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="500" fill="#b3d1e8" rx="6"/>
        <path d="M95,45 L145,28 L198,22 L248,28 L290,42 L318,62 L325,88 L318,118 L305,145 L295,172 L298,198 L288,225 L272,248 L252,268 L228,282 L205,288 L182,282 L160,265 L142,245 L128,222 L118,198 L108,172 L98,148 L88,120 L82,92 L82,68 Z" fill="#d0eaf8" stroke="#8ab8d8" strokeWidth="1.5"/>
        <path d="M128,75 L185,62 L238,68 L278,85 L292,112 L285,145 L272,168 L258,188 L242,205 L222,215 L200,218 L178,212 L158,198 L142,178 L132,155 L122,130 L118,105 Z" fill="#e8f4fc" stroke="none"/>
        <path d="M88,168 L102,162 L108,172 L98,178 Z" fill="#b3d1e8"/>
        <path d="M82,145 L96,140 L100,150 L88,155 Z" fill="#b3d1e8"/>
        <path d="M95,205 L108,200 L115,212 L102,218 Z" fill="#b3d1e8"/>
        <path d="M305,145 L315,148 L312,162 L302,158 Z" fill="#b3d1e8"/>
        <path d="M298,172 L310,175 L308,188 L296,185 Z" fill="#b3d1e8"/>
        <text x="200" y="88" fontSize="16" fill="#2a5a8a" textAnchor="middle" fontWeight="bold">GREENLAND</text>
        <text x="200" y="105" fontSize="9" fill="#4a7a9a" textAnchor="middle">(Kalaallit Nunaat)</text>
        <text x="200" y="158" fontSize="10" fill="#6a9abf" textAnchor="middle">Greenland</text>
        <text x="200" y="170" fontSize="10" fill="#6a9abf" textAnchor="middle">Ice Sheet</text>
        <circle cx="118" cy="338" r="4" fill="#e05c5c"/>
        <text x="130" y="342" fontSize="9" fill="#1a3a5c" fontWeight="bold">Nuuk (Capital)</text>
        <circle cx="128" cy="268" r="3" fill="#5b9bd5"/>
        <text x="140" y="272" fontSize="7.5" fill="#1a3a5c">Kangerlussuaq</text>
        <circle cx="145" cy="188" r="3" fill="#5b9bd5"/>
        <text x="157" y="192" fontSize="7.5" fill="#1a3a5c">Upernavik</text>
        <text x="45" y="200" fontSize="8" fill="#4a7a9a" textAnchor="middle" transform="rotate(-90,45,200)">Baffin Bay</text>
        <text x="355" y="180" fontSize="8" fill="#4a7a9a" textAnchor="middle" transform="rotate(90,355,180)">Greenland Sea</text>
        <line x1="60" y1="298" x2="340" y2="298" stroke="#e05c5c" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.6"/>
        <text x="345" y="302" fontSize="6.5" fill="#e05c5c">Arctic Circle</text>
        <rect x="15" y="395" width="370" height="68" fill="rgba(0,0,0,0.2)" rx="4"/>
        <text x="200" y="412" fontSize="8" fill="#ccc" textAnchor="middle" fontWeight="bold">Key Facts</text>
        <text x="200" y="425" fontSize="7.5" fill="#bbb" textAnchor="middle">World's largest island • 836,330 mi² • 80% ice-covered</text>
        <text x="200" y="437" fontSize="7.5" fill="#bbb" textAnchor="middle">Autonomous territory of Denmark • ~57,000 population</text>
        <text x="200" y="449" fontSize="7.5" fill="#bbb" textAnchor="middle">Capital: Nuuk • Indigenous Inuit (Kalaallit) people</text>
      </svg>
    </div>
  );
}

function GeographySouthAmericaMap() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">South America</p>
      <svg viewBox="0 0 400 580" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="580" fill="#b3d1e8" rx="6"/>
        <path d="M118,52 L178,45 L205,55 L215,75 L205,92 L182,98 L158,95 L135,88 L118,75 Z" fill="#e8a838" stroke="#a06010" strokeWidth="1"/>
        <path d="M178,45 L248,38 L275,48 L282,68 L268,85 L242,92 L215,88 L205,72 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="1"/>
        <path d="M248,42 L318,38 L335,52 L328,72 L295,78 L268,75 L252,62 Z" fill="#9b7fd4" stroke="#6040b0" strokeWidth="0.8"/>
        <path d="M92,92 L128,88 L138,108 L128,128 L105,132 L88,118 Z" fill="#4a9e6b" stroke="#206040" strokeWidth="1"/>
        <path d="M88,128 L155,122 L168,142 L172,178 L162,215 L145,235 L118,242 L92,228 L78,205 L75,175 L78,150 Z" fill="#5b9bd5" stroke="#2060a0" strokeWidth="1"/>
        <path d="M155,75 L282,68 L320,82 L345,105 L355,138 L358,175 L350,215 L335,248 L315,275 L288,295 L258,308 L228,315 L198,308 L172,290 L158,268 L148,242 L142,215 L145,185 L148,155 L152,125 L155,95 Z" fill="#4a9e6b" stroke="#206040" strokeWidth="1"/>
        <path d="M148,238 L205,228 L222,242 L225,268 L215,288 L192,298 L168,292 L152,272 L148,255 Z" fill="#e8a838" stroke="#a06010" strokeWidth="0.8"/>
        <path d="M205,288 L248,280 L262,295 L258,318 L235,325 L212,318 L205,305 Z" fill="#9b7fd4" stroke="#6040b0" strokeWidth="0.8"/>
        <path d="M78,242 L118,235 L132,252 L135,285 L130,318 L122,352 L112,385 L100,418 L88,448 L75,462 L62,448 L58,415 L62,382 L65,348 L68,315 L70,282 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="1"/>
        <path d="M132,255 L195,245 L215,258 L222,285 L218,318 L208,352 L195,385 L175,415 L155,438 L135,448 L115,435 L100,415 L105,382 L112,348 L118,318 L122,285 Z" fill="#d4845a" stroke="#904020" strokeWidth="1"/>
        <path d="M215,318 L255,312 L268,328 L262,348 L238,355 L215,345 Z" fill="#5b9bd5" stroke="#2060a0" strokeWidth="0.8"/>
        <ellipse cx="215" cy="488" rx="12" ry="8" fill="#e8c87a" stroke="#a08020" strokeWidth="0.8"/>
        <text x="235" y="492" fontSize="6.5" fill="#5a4000">Falklands (UK)</text>
        <path d="M118,455 L148,448 L158,462 L148,475 L122,478 L108,468 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="0.8"/>
        <text x="152" y="72" fontSize="7.5" fill="white" textAnchor="middle" fontWeight="bold">VENEZUELA</text>
        <text x="148" y="175" fontSize="10" fill="white" textAnchor="middle" fontWeight="bold">BRAZIL</text>
        <text x="112" y="108" fontSize="7" fill="white" textAnchor="middle">COL.</text>
        <text x="108" y="125" fontSize="6.5" fill="white" textAnchor="middle">ECU.</text>
        <text x="118" y="182" fontSize="8" fill="white" textAnchor="middle" fontWeight="bold">PERU</text>
        <text x="185" y="265" fontSize="7" fill="white" textAnchor="middle">BOL.</text>
        <text x="232" y="305" fontSize="6.5" fill="white" textAnchor="middle">PAR.</text>
        <text x="235" y="335" fontSize="7" fill="#2a2a6a" textAnchor="middle">URU.</text>
        <text x="82" y="358" fontSize="7.5" fill="white" textAnchor="middle" fontWeight="bold">CHILE</text>
        <text x="168" y="358" fontSize="9" fill="white" textAnchor="middle" fontWeight="bold">ARGENTINA</text>
        <text x="285" y="58" fontSize="6.5" fill="white" textAnchor="middle">GUYANA</text>
        <text x="30" y="280" fontSize="8" fill="#4a7a9a" textAnchor="middle" transform="rotate(-90,30,280)">PACIFIC OCEAN</text>
        <text x="375" y="280" fontSize="8" fill="#4a7a9a" textAnchor="middle" transform="rotate(90,375,280)">ATLANTIC OCEAN</text>
        <text x="200" y="555" fontSize="8" fill="#888" textAnchor="middle">12 countries • 430 million people</text>
      </svg>
    </div>
  );
}

function GeographyAustraliaMap() {
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Australia & Oceania</p>
      <svg viewBox="0 0 520 440" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        <rect width="520" height="440" fill="#b3d1e8" rx="6"/>
        <path d="M72,88 L128,72 L192,65 L258,68 L315,78 L358,95 L385,118 L395,148 L392,178 L382,208 L365,232 L342,252 L315,265 L285,272 L255,268 L225,258 L198,242 L175,222 L155,198 L138,172 L122,148 L105,125 L85,108 Z" fill="#e8c87a" stroke="#a08020" strokeWidth="1.5"/>
        <path d="M72,88 L155,75 L162,105 L158,178 L152,228 L138,258 L118,265 L95,255 L75,232 L62,205 L58,175 L62,145 L65,115 Z" fill="#e0b850" stroke="#a08020" strokeWidth="0.8" opacity="0.7"/>
        <path d="M195,68 L268,65 L272,92 L268,155 L255,162 L238,158 L218,162 L198,155 L192,125 Z" fill="#d4a840" stroke="#a08020" strokeWidth="0.8" opacity="0.7"/>
        <path d="M265,68 L335,75 L358,95 L362,128 L355,165 L338,182 L315,188 L295,182 L272,165 L268,135 L265,105 Z" fill="#e8b848" stroke="#a08020" strokeWidth="0.8" opacity="0.7"/>
        <path d="M162,158 L255,152 L258,195 L248,228 L228,238 L205,242 L182,235 L162,218 L155,195 Z" fill="#d8a838" stroke="#a08020" strokeWidth="0.8" opacity="0.7"/>
        <path d="M272,168 L338,162 L348,195 L342,228 L322,248 L298,255 L275,248 L258,228 L258,198 Z" fill="#e0b040" stroke="#a08020" strokeWidth="0.8" opacity="0.7"/>
        <path d="M258,232 L322,225 L330,248 L315,265 L288,270 L260,265 L250,250 Z" fill="#c89828" stroke="#a08020" strokeWidth="0.8" opacity="0.7"/>
        <path d="M275,285 L305,278 L318,292 L312,312 L292,318 L272,308 L268,295 Z" fill="#e8c87a" stroke="#a08020" strokeWidth="1"/>
        <path d="M422,228 L448,218 L462,232 L458,258 L442,268 L425,258 L418,242 Z" fill="#4a9e6b" stroke="#206040" strokeWidth="1"/>
        <path d="M418,268 L448,258 L462,272 L458,298 L440,312 L418,305 L408,290 L410,278 Z" fill="#4a9e6b" stroke="#206040" strokeWidth="1"/>
        <path d="M305,28 L358,22 L385,35 L388,52 L368,62 L338,65 L312,55 L298,42 Z" fill="#9b7fd4" stroke="#6040b0" strokeWidth="1"/>
        <path d="M52,42 L108,35 L125,48 L118,62 L88,68 L55,58 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="0.8"/>
        <path d="M120,32 L165,25 L178,38 L172,52 L145,58 L122,48 Z" fill="#e05c5c" stroke="#a02020" strokeWidth="0.8"/>
        <ellipse cx="455" cy="155" rx="8" ry="6" fill="#5b9bd5" stroke="#2060a0" strokeWidth="0.8"/>
        <text x="468" y="159" fontSize="6.5" fill="#2a5a8a">FIJI</text>
        <text x="105" y="172" fontSize="7.5" fill="#3a2800" textAnchor="middle">W. AUSTRALIA</text>
        <text x="230" y="115" fontSize="7" fill="#3a2800" textAnchor="middle">N. TERRITORY</text>
        <text x="312" y="128" fontSize="7" fill="#3a2800" textAnchor="middle">QLD</text>
        <text x="205" y="198" fontSize="7" fill="#3a2800" textAnchor="middle">S. AUSTRALIA</text>
        <text x="305" y="215" fontSize="7" fill="#3a2800" textAnchor="middle">NSW</text>
        <text x="290" y="252" fontSize="6.5" fill="#3a2800" textAnchor="middle">VIC</text>
        <text x="292" y="300" fontSize="7" fill="#3a2800" textAnchor="middle">Tasmania</text>
        <text x="440" y="245" fontSize="7.5" fill="white" textAnchor="middle">NZ</text>
        <text x="348" y="42" fontSize="7.5" fill="white" textAnchor="middle">PNG</text>
        <text x="118" y="50" fontSize="6.5" fill="white" textAnchor="middle">INDONESIA</text>
        <circle cx="322" cy="242" r="4" fill="#e05c5c"/>
        <text x="335" y="246" fontSize="7" fill="#1a3a5c">Canberra ★</text>
        <line x1="50" y1="188" x2="415" y2="188" stroke="#e05c5c" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.5"/>
        <text x="420" y="192" fontSize="6" fill="#e05c5c" opacity="0.8">Tropic of Capricorn</text>
        <text x="30" y="200" fontSize="7.5" fill="#4a7a9a" textAnchor="middle" transform="rotate(-90,30,200)">INDIAN OCEAN</text>
        <text x="495" y="200" fontSize="7.5" fill="#4a7a9a" textAnchor="middle" transform="rotate(90,495,200)">PACIFIC OCEAN</text>
        <text x="260" y="420" fontSize="8" fill="#888" textAnchor="middle">Australia + NZ + Pacific islands = Oceania • Pop. ~45M</text>
      </svg>
    </div>
  );
}

function GeographyLatLong() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Latitude & Longitude</p>
      <div className="grid grid-cols-2 gap-2 w-full text-xs">
        <div className="border border-blue-300 rounded p-2 bg-blue-50 dark:bg-blue-900/20">
          <div className="font-bold text-blue-700 dark:text-blue-300 mb-1">Latitude (Parallels)</div>
          <div>↔ Horizontal lines</div>
          <div className="mt-1 space-y-0.5">
            <div>90°N = North Pole</div>
            <div className="font-bold">0° = Equator</div>
            <div>90°S = South Pole</div>
            <div className="text-muted-foreground mt-1">Tropic of Cancer: 23.5°N</div>
            <div className="text-muted-foreground">Tropic of Capricorn: 23.5°S</div>
          </div>
        </div>
        <div className="border border-green-300 rounded p-2 bg-green-50 dark:bg-green-900/20">
          <div className="font-bold text-green-700 dark:text-green-300 mb-1">Longitude (Meridians)</div>
          <div>↕ Vertical lines</div>
          <div className="mt-1 space-y-0.5">
            <div>180° = Int'l Date Line</div>
            <div className="font-bold">0° = Prime Meridian</div>
            <div className="text-muted-foreground mt-1">(Greenwich, UK)</div>
            <div className="text-muted-foreground">E = East, W = West</div>
          </div>
        </div>
      </div>
      <div className="bg-muted rounded p-2 text-xs w-full text-center">
        <span className="font-bold">Example:</span> New York City = 40.7°N, 74.0°W
      </div>
    </div>
  );
}

// ─── PHYSICS ──────────────────────────────────────────────────

function PhysicsNewtonsLaws() {
  const laws = [
    { num: '1st', name: 'Law of Inertia', desc: 'An object at rest stays at rest; an object in motion stays in motion — unless acted on by a net force.', formula: 'ΣF = 0 → constant velocity', color: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' },
    { num: '2nd', name: 'F = ma', desc: 'Force equals mass times acceleration. The larger the mass, the more force needed.', formula: 'F = ma', color: 'border-green-500 bg-green-50 dark:bg-green-950/30' },
    { num: '3rd', name: 'Action-Reaction', desc: 'For every action there is an equal and opposite reaction.', formula: 'F₁₂ = −F₂₁', color: 'border-purple-500 bg-purple-50 dark:bg-purple-950/30' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Newton's Three Laws of Motion</p>
      {laws.map(({num,name,desc,formula,color})=>(
        <div key={num} className={`border-l-4 ${color} rounded-r px-2 py-2`}>
          <div className="text-xs font-bold">{num} Law — {name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
          <div className="text-xs font-mono font-bold mt-1">{formula}</div>
        </div>
      ))}
    </div>
  );
}

function PhysicsElectromagneticSpectrum() {
  const waves = [
    { name: 'Radio', freq: '< 3 GHz', use: 'Broadcasting, WiFi', color: 'bg-red-100 dark:bg-red-900/30' },
    { name: 'Microwave', freq: '3 GHz–300 GHz', use: 'Radar, microwave ovens', color: 'bg-orange-100 dark:bg-orange-900/30' },
    { name: 'Infrared', freq: '300 GHz–400 THz', use: 'Heat, night vision', color: 'bg-yellow-100 dark:bg-yellow-900/30' },
    { name: 'Visible', freq: '400–700 THz', use: 'Human vision (ROYGBIV)', color: 'bg-green-100 dark:bg-green-900/30' },
    { name: 'Ultraviolet', freq: '700 THz–30 PHz', use: 'Sun, sterilization', color: 'bg-blue-100 dark:bg-blue-900/30' },
    { name: 'X-Ray', freq: '30 PHz–30 EHz', use: 'Medical imaging', color: 'bg-indigo-100 dark:bg-indigo-900/30' },
    { name: 'Gamma Ray', freq: '> 30 EHz', use: 'Nuclear, cancer treatment', color: 'bg-purple-100 dark:bg-purple-900/30' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Electromagnetic Spectrum</p>
      <div className="text-xs text-muted-foreground text-center mb-1">← Long wavelength / Low energy ——— Short wavelength / High energy →</div>
      {waves.map(({name,freq,use,color})=>(
        <div key={name} className={`${color} rounded px-2 py-1 flex items-center gap-2`}>
          <div className="w-20 text-xs font-bold shrink-0">{name}</div>
          <div className="text-xs text-muted-foreground shrink-0 w-28">{freq}</div>
          <div className="text-xs italic">{use}</div>
        </div>
      ))}
    </div>
  );
}

function PhysicsFormulas() {
  const formulas = [
    { cat: 'Motion', items: ['v = u + at', 's = ut + ½at²', 'v² = u² + 2as'] },
    { cat: 'Force & Energy', items: ['W = Fd·cosθ', 'KE = ½mv²', 'PE = mgh', 'P = W/t'] },
    { cat: 'Waves', items: ['v = fλ', 'T = 1/f', 'c = 3×10⁸ m/s'] },
    { cat: 'Electricity', items: ['V = IR', 'P = IV', 'P = I²R'] },
    { cat: 'Gravity', items: ['F = Gm₁m₂/r²', 'g = 9.8 m/s²'] },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Physics Formula Sheet</p>
      {formulas.map(({cat,items})=>(
        <div key={cat} className="border border-border rounded p-1.5">
          <div className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">{cat}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {items.map(f=><span key={f} className="text-xs font-mono">{f}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function PhysicsThermodynamics() {
  const laws = [
    { num: '0th', law: 'Thermal equilibrium: if A=B and B=C, then A=C' },
    { num: '1st', law: 'Energy conservation: ΔU = Q − W (internal energy = heat in − work done)' },
    { num: '2nd', law: 'Entropy increases: heat flows hot → cold; disorder increases' },
    { num: '3rd', law: 'Absolute zero (0 K = −273.15°C) has zero entropy' },
  ];
  const conversions = ['K = °C + 273.15', '°C = (°F − 32) × 5/9', '°F = °C × 9/5 + 32'];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Laws of Thermodynamics</p>
      {laws.map(({num,law})=>(
        <div key={num} className="border-l-4 border-orange-400 pl-2 py-1">
          <div className="text-xs font-bold text-orange-700 dark:text-orange-300">{num} Law</div>
          <div className="text-xs text-muted-foreground">{law}</div>
        </div>
      ))}
      <div className="bg-muted rounded p-1.5">
        <div className="text-xs font-bold mb-1">Temperature Conversions</div>
        {conversions.map(c=><div key={c} className="text-xs font-mono">{c}</div>)}
      </div>
    </div>
  );
}

function ScienceAtomicStructure() {
  const particles = [
    { name: 'Proton', charge: '+1', location: 'Nucleus', mass: '1 amu', color: 'bg-red-100 dark:bg-red-900/30 border-red-400' },
    { name: 'Neutron', charge: '0', location: 'Nucleus', mass: '1 amu', color: 'bg-gray-100 dark:bg-gray-800 border-gray-400' },
    { name: 'Electron', charge: '−1', location: 'Electron shell', mass: '~0 amu', color: 'bg-blue-100 dark:bg-blue-900/30 border-blue-400' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Atomic Structure</p>
      <div className="flex flex-col gap-1.5">
        {particles.map(({name,charge,location,mass,color})=>(
          <div key={name} className={`border ${color} rounded p-2 grid grid-cols-4 text-xs`}>
            <span className="font-bold">{name}</span>
            <span className="text-center">{charge}</span>
            <span className="text-center">{location}</span>
            <span className="text-center">{mass}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mt-1">
        <div className="bg-muted rounded p-1.5">
          <div className="font-bold">Atomic Number</div>
          <div className="text-muted-foreground">= # of protons</div>
          <div className="text-muted-foreground">= # of electrons (neutral)</div>
        </div>
        <div className="bg-muted rounded p-1.5">
          <div className="font-bold">Mass Number</div>
          <div className="text-muted-foreground">= protons + neutrons</div>
          <div className="text-muted-foreground">Isotopes vary neutrons</div>
        </div>
      </div>
    </div>
  );
}

function ScienceChemicalBonding() {
  const bonds = [
    { name: 'Ionic', desc: 'Electron transfer between metal & nonmetal', ex: 'NaCl (table salt)', strength: 'Strong in solid', color: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' },
    { name: 'Covalent', desc: 'Electrons shared between nonmetals', ex: 'H₂O, CO₂', strength: 'Varies', color: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' },
    { name: 'Polar Covalent', desc: 'Unequal sharing due to electronegativity diff.', ex: 'H₂O (δ+ on H, δ− on O)', strength: 'Moderate', color: 'border-purple-400 bg-purple-50 dark:bg-purple-900/20' },
    { name: 'Metallic', desc: 'Sea of delocalized electrons in metals', ex: 'Fe, Cu, Au', strength: 'Strong', color: 'border-gray-400 bg-gray-50 dark:bg-gray-800' },
    { name: 'Hydrogen', desc: 'H bonded to F, O, or N — intermolecular', ex: 'Water molecules', strength: 'Weak', color: 'border-teal-400 bg-teal-50 dark:bg-teal-900/20' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Types of Chemical Bonds</p>
      {bonds.map(({name,desc,ex,color})=>(
        <div key={name} className={`border-l-4 ${color} rounded-r px-2 py-1.5`}>
          <div className="text-xs font-bold">{name}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
          <div className="text-xs italic">e.g. {ex}</div>
        </div>
      ))}
    </div>
  );
}

function ScienceDNAGenetics() {
  const bases = [
    { b: 'Adenine (A)', pairs: 'Thymine (T)', color: 'text-blue-600 dark:text-blue-400' },
    { b: 'Thymine (T)', pairs: 'Adenine (A)', color: 'text-green-600 dark:text-green-400' },
    { b: 'Cytosine (C)', pairs: 'Guanine (G)', color: 'text-orange-600 dark:text-orange-400' },
    { b: 'Guanine (G)', pairs: 'Cytosine (C)', color: 'text-purple-600 dark:text-purple-400' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">DNA & Genetics</p>
      <div className="bg-muted rounded p-2 text-xs">
        <div className="font-bold mb-1">DNA Double Helix</div>
        <div>DNA = Deoxyribonucleic Acid</div>
        <div className="text-muted-foreground">Sugar-phosphate backbone + base pairs wound in helix</div>
      </div>
      <div>
        <div className="text-xs font-bold mb-1">Base Pairing Rules (A-T, C-G)</div>
        {bases.map(({b,pairs,color})=>(
          <div key={b} className="flex items-center gap-2 text-xs py-0.5 border-b border-border/30">
            <span className={`font-bold ${color} w-28`}>{b}</span>
            <span className="text-muted-foreground">↔</span>
            <span className={`font-bold ${color}`}>{pairs}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-muted rounded p-1.5">
          <div className="font-bold">Mitosis</div>
          <div className="text-muted-foreground">Cell division for growth — produces 2 identical cells</div>
        </div>
        <div className="bg-muted rounded p-1.5">
          <div className="font-bold">Meiosis</div>
          <div className="text-muted-foreground">Produces gametes (sex cells) — 4 cells, half chromosomes</div>
        </div>
      </div>
    </div>
  );
}

function SciencePunnettSquare() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Punnett Square — Genetics</p>
      <div className="flex flex-col items-center">
        <div className="text-xs text-muted-foreground mb-1">Example: Tt × Tt (Tall × Tall, T dominant)</div>
        <table className="border-collapse">
          <thead><tr>
            <th className="w-10 h-10"></th>
            <th className="w-12 h-10 text-center text-sm font-black text-blue-600">T</th>
            <th className="w-12 h-10 text-center text-sm font-black text-blue-600">t</th>
          </tr></thead>
          <tbody>
            <tr>
              <td className="text-center text-sm font-black text-green-600">T</td>
              <td className="border-2 border-border w-12 h-12 text-center font-bold text-sm bg-green-50 dark:bg-green-900/20">TT</td>
              <td className="border-2 border-border w-12 h-12 text-center font-bold text-sm bg-green-50 dark:bg-green-900/20">Tt</td>
            </tr>
            <tr>
              <td className="text-center text-sm font-black text-green-600">t</td>
              <td className="border-2 border-border w-12 h-12 text-center font-bold text-sm bg-green-50 dark:bg-green-900/20">Tt</td>
              <td className="border-2 border-border w-12 h-12 text-center font-bold text-sm bg-red-50 dark:bg-red-900/20 text-red-700">tt</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs w-full">
        <div className="bg-green-50 dark:bg-green-900/20 rounded p-1.5 text-center"><div className="font-bold">75%</div><div className="text-muted-foreground">Tall (TT or Tt)</div></div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded p-1.5 text-center"><div className="font-bold">25%</div><div className="text-muted-foreground">Short (tt)</div></div>
        <div className="bg-muted rounded p-1.5 text-center"><div className="font-bold">3:1</div><div className="text-muted-foreground">Phenotype ratio</div></div>
      </div>
    </div>
  );
}

// ─── ECONOMICS — ADVANCED ─────────────────────────────────────

function EconomicsGDP() {
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">GDP & Macroeconomics</p>
      <div className="border border-border rounded p-2 bg-blue-50 dark:bg-blue-950/30">
        <div className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">GDP Expenditure Formula</div>
        <div className="text-sm font-mono font-black text-center">GDP = C + I + G + (X − M)</div>
        <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
          <div><span className="font-bold">C</span> = Consumer spending</div>
          <div><span className="font-bold">I</span> = Business Investment</div>
          <div><span className="font-bold">G</span> = Government spending</div>
          <div><span className="font-bold">X−M</span> = Net exports</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-border rounded p-1.5">
          <div className="font-bold">Nominal GDP</div>
          <div className="text-muted-foreground">At current prices — not adjusted for inflation</div>
        </div>
        <div className="border border-border rounded p-1.5">
          <div className="font-bold">Real GDP</div>
          <div className="text-muted-foreground">Adjusted for inflation — better for comparisons</div>
        </div>
        <div className="border border-border rounded p-1.5">
          <div className="font-bold">GDP per Capita</div>
          <div className="text-muted-foreground">GDP ÷ population — measures living standard</div>
        </div>
        <div className="border border-border rounded p-1.5">
          <div className="font-bold">Business Cycle</div>
          <div className="text-muted-foreground">Expansion → Peak → Recession → Trough → Recovery</div>
        </div>
      </div>
    </div>
  );
}

function EconomicsMarketStructures() {
  const structures = [
    { name: 'Perfect Competition', firms: 'Many', price: 'Price taker', ex: 'Agriculture', color: 'bg-green-50 dark:bg-green-900/20 border-green-400' },
    { name: 'Monopolistic Comp.', firms: 'Many', price: 'Some control', ex: 'Restaurants', color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-400' },
    { name: 'Oligopoly', firms: 'Few', price: 'Interdependent', ex: 'Airlines, Oil', color: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400' },
    { name: 'Monopoly', firms: '1', price: 'Price maker', ex: 'Utilities', color: 'bg-red-50 dark:bg-red-900/20 border-red-400' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Market Structures</p>
      <div className="grid grid-cols-4 text-xs text-muted-foreground border-b border-border pb-1">
        <span className="font-bold">Structure</span>
        <span className="font-bold text-center">Firms</span>
        <span className="font-bold text-center">Pricing</span>
        <span className="font-bold text-center">Example</span>
      </div>
      {structures.map(({name,firms,price,ex,color})=>(
        <div key={name} className={`border-l-4 ${color} rounded-r grid grid-cols-4 items-center px-2 py-1.5 text-xs`}>
          <span className="font-bold">{name}</span>
          <span className="text-center">{firms}</span>
          <span className="text-center">{price}</span>
          <span className="text-center italic text-muted-foreground">{ex}</span>
        </div>
      ))}
    </div>
  );
}

function EconomicsFiscalMonetary() {
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Fiscal vs. Monetary Policy</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-blue-300 rounded p-2 bg-blue-50 dark:bg-blue-900/20">
          <div className="font-bold text-blue-700 dark:text-blue-300 mb-1">Fiscal Policy</div>
          <div className="text-muted-foreground mb-1">Controlled by: Congress & President</div>
          <div className="font-semibold">Expansionary:</div>
          <div className="text-muted-foreground">↑ Spending or ↓ Taxes</div>
          <div className="font-semibold mt-1">Contractionary:</div>
          <div className="text-muted-foreground">↓ Spending or ↑ Taxes</div>
        </div>
        <div className="border border-green-300 rounded p-2 bg-green-50 dark:bg-green-900/20">
          <div className="font-bold text-green-700 dark:text-green-300 mb-1">Monetary Policy</div>
          <div className="text-muted-foreground mb-1">Controlled by: Federal Reserve</div>
          <div className="font-semibold">Expansionary:</div>
          <div className="text-muted-foreground">↓ Interest rates, buy bonds</div>
          <div className="font-semibold mt-1">Contractionary:</div>
          <div className="text-muted-foreground">↑ Interest rates, sell bonds</div>
        </div>
      </div>
      <div className="bg-muted rounded p-1.5 text-xs text-center">
        Goal: balance unemployment ↔ inflation (Phillips Curve tradeoff)
      </div>
    </div>
  );
}

function EconomicsComparativeAdvantage() {
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Comparative Advantage & Trade</p>
      <div className="text-xs bg-muted rounded p-2">
        <span className="font-bold">Comparative Advantage:</span> Produce what you can make at the <em>lowest opportunity cost</em> — even if another party is better at everything.
      </div>
      <table className="w-full text-xs border-collapse">
        <thead><tr className="bg-muted">
          <th className="border border-border px-2 py-1">Country</th>
          <th className="border border-border px-2 py-1">Wheat (hrs/unit)</th>
          <th className="border border-border px-2 py-1">Cloth (hrs/unit)</th>
          <th className="border border-border px-2 py-1">Advantage in</th>
        </tr></thead>
        <tbody>
          <tr>
            <td className="border border-border px-2 py-1 font-bold">USA</td>
            <td className="border border-border px-2 py-1 text-center bg-green-50 dark:bg-green-900/20">1</td>
            <td className="border border-border px-2 py-1 text-center">2</td>
            <td className="border border-border px-2 py-1 text-green-700 dark:text-green-400 font-bold">Wheat</td>
          </tr>
          <tr>
            <td className="border border-border px-2 py-1 font-bold">UK</td>
            <td className="border border-border px-2 py-1 text-center">3</td>
            <td className="border border-border px-2 py-1 text-center bg-green-50 dark:bg-green-900/20">1.5</td>
            <td className="border border-border px-2 py-1 text-green-700 dark:text-green-400 font-bold">Cloth</td>
          </tr>
        </tbody>
      </table>
      <div className="text-xs text-muted-foreground">→ Both countries gain by specializing and trading</div>
    </div>
  );
}

// ─── POLITICAL SCIENCE / HISTORY ──────────────────────────────

function PoliSciConstitution() {
  const articles = [
    { art: 'Art. I', desc: 'Legislative Branch — Congress (Senate + House)' },
    { art: 'Art. II', desc: 'Executive Branch — President & Cabinet' },
    { art: 'Art. III', desc: 'Judicial Branch — Supreme Court & federal courts' },
    { art: 'Art. IV', desc: 'States\' powers and relationships' },
    { art: 'Art. V', desc: 'Amendment process' },
    { art: 'Art. VI', desc: 'Supremacy Clause — Constitution is supreme law' },
    { art: 'Art. VII', desc: 'Ratification requirements' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">U.S. Constitution Structure</p>
      <div className="text-xs bg-muted rounded p-1.5 text-center mb-1">Ratified 1788 • 27 Amendments • Preamble: "We the People..."</div>
      {articles.map(({art,desc})=>(
        <div key={art} className="flex gap-2 text-xs border-b border-border/30 pb-1">
          <span className="font-black text-blue-700 dark:text-blue-300 w-12 shrink-0">{art}</span>
          <span className="text-muted-foreground">{desc}</span>
        </div>
      ))}
    </div>
  );
}

function PoliSciBillOfRights() {
  const amendments = [
    { n: '1st', desc: 'Freedom of speech, religion, press, assembly, petition' },
    { n: '2nd', desc: 'Right to bear arms' },
    { n: '3rd', desc: 'No quartering of soldiers' },
    { n: '4th', desc: 'Protection against unreasonable search & seizure' },
    { n: '5th', desc: 'Due process, no self-incrimination, no double jeopardy' },
    { n: '6th', desc: 'Right to speedy trial, jury, and attorney' },
    { n: '7th', desc: 'Right to jury trial in civil cases' },
    { n: '8th', desc: 'No cruel or unusual punishment' },
    { n: '9th', desc: 'Rights not listed still belong to the people' },
    { n: '10th', desc: 'Powers not given to U.S. go to states or people' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">The Bill of Rights (Amendments 1–10)</p>
      {amendments.map(({n,desc})=>(
        <div key={n} className="flex gap-2 text-xs border-b border-border/30 pb-1">
          <span className="font-black text-red-700 dark:text-red-400 w-8 shrink-0">{n}</span>
          <span className="text-muted-foreground">{desc}</span>
        </div>
      ))}
    </div>
  );
}

function PoliSciWorldGovernments() {
  const types = [
    { name: 'Democracy', desc: 'Citizens vote; power from the people', ex: 'USA, France, India' },
    { name: 'Republic', desc: 'Representatives elected to govern', ex: 'USA, Germany' },
    { name: 'Monarchy', desc: 'Hereditary ruler (king/queen)', ex: 'UK (constitutional), Saudi Arabia' },
    { name: 'Theocracy', desc: 'Government by religious leaders/law', ex: 'Iran, Vatican City' },
    { name: 'Authoritarian', desc: 'Centralized power; limited civil liberties', ex: 'Russia, China' },
    { name: 'Totalitarian', desc: 'Complete state control over all aspects of life', ex: 'N. Korea, Nazi Germany' },
    { name: 'Oligarchy', desc: 'Rule by a small, powerful group', ex: 'Historical: Sparta' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Types of Government Systems</p>
      {types.map(({name,desc,ex})=>(
        <div key={name} className="border-l-4 border-blue-400 pl-2 py-0.5">
          <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{name}: </span>
          <span className="text-xs text-muted-foreground">{desc}</span>
          <div className="text-xs italic">{ex}</div>
        </div>
      ))}
    </div>
  );
}

// ─── COLLEGE ENGLISH / WRITING / GRAMMAR / READING ───────────

function EnglishThesisDevelopment() {
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Thesis Statement Development</p>
      <div className="flex flex-col gap-2">
        <div className="border border-red-300 rounded p-2 bg-red-50 dark:bg-red-900/20">
          <div className="text-xs font-bold text-red-700 dark:text-red-300 mb-1">❌ Weak Thesis</div>
          <div className="text-xs italic">"Social media has good and bad effects on people."</div>
          <div className="text-xs text-muted-foreground mt-1">Too vague — no argument, no direction</div>
        </div>
        <div className="border border-green-300 rounded p-2 bg-green-50 dark:bg-green-900/20">
          <div className="text-xs font-bold text-green-700 dark:text-green-300 mb-1">✅ Strong Thesis</div>
          <div className="text-xs italic">"Instagram's algorithmic design deliberately exploits dopamine-driven behavior, increasing teen anxiety by prioritizing engagement over wellbeing."</div>
          <div className="text-xs text-muted-foreground mt-1">Specific + arguable + tells reader what to expect</div>
        </div>
      </div>
      <div className="bg-muted rounded p-2 text-xs">
        <div className="font-bold mb-1">Thesis Formula</div>
        <div className="font-mono">Topic + Claim + Reason(s) = Strong Thesis</div>
        <div className="text-muted-foreground mt-1">Ask: Could someone reasonably disagree? If yes → arguable thesis ✓</div>
      </div>
    </div>
  );
}

function EnglishArgumentStructure() {
  const parts = [
    { name: 'Claim', desc: 'Your main argument or position', ex: 'Remote work increases productivity', color: 'bg-blue-100 dark:bg-blue-900/30 border-blue-400' },
    { name: 'Evidence', desc: 'Data, quotes, research supporting your claim', ex: 'Stanford study: 13% productivity gain', color: 'bg-green-100 dark:bg-green-900/30 border-green-400' },
    { name: 'Warrant', desc: 'Explains WHY the evidence supports the claim', ex: 'Fewer interruptions = deeper focus work', color: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400' },
    { name: 'Counterargument', desc: 'The opposing view you must acknowledge', ex: 'Critics argue collaboration suffers', color: 'bg-orange-100 dark:bg-orange-900/30 border-orange-400' },
    { name: 'Rebuttal', desc: 'Your response that refutes the counterargument', ex: 'Digital tools now replicate in-person collaboration', color: 'bg-purple-100 dark:bg-purple-900/30 border-purple-400' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Argumentative Writing Structure</p>
      {parts.map(({name,desc,ex,color})=>(
        <div key={name} className={`border-l-4 ${color} rounded-r px-2 py-1.5`}>
          <div className="text-xs font-bold">{name}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
          <div className="text-xs italic">{ex}</div>
        </div>
      ))}
    </div>
  );
}

function EnglishResearchPaperStructure() {
  const sections = [
    { s: 'Abstract', desc: '150–250 words: purpose, methods, findings, conclusion' },
    { s: 'Introduction', desc: 'Background, significance, gap in literature, thesis/research question' },
    { s: 'Literature Review', desc: 'What existing research says; identify gaps your paper fills' },
    { s: 'Methodology', desc: 'How data was collected and analyzed; replicable process' },
    { s: 'Results', desc: 'What you found — data, statistics, observations (no interpretation)' },
    { s: 'Discussion', desc: 'Interpret results; connect to lit review; limitations; implications' },
    { s: 'Conclusion', desc: 'Summarize findings; future research; broader significance' },
    { s: 'References', desc: 'All cited sources in correct format (APA, MLA, Chicago)' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Research Paper Structure (Academic)</p>
      {sections.map(({s,desc})=>(
        <div key={s} className="flex gap-2 text-xs border-b border-border/30 pb-1">
          <span className="font-bold text-blue-700 dark:text-blue-300 w-28 shrink-0">{s}</span>
          <span className="text-muted-foreground">{desc}</span>
        </div>
      ))}
    </div>
  );
}

function EnglishCitationFormats() {
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Citation Formats — APA & MLA</p>
      <div className="flex flex-col gap-2 text-xs">
        <div className="border border-blue-300 rounded p-2 bg-blue-50 dark:bg-blue-950/30">
          <div className="font-bold text-blue-700 dark:text-blue-300 mb-1">APA 7th Edition</div>
          <div className="font-bold">Journal Article:</div>
          <div className="font-mono text-xs">Author, A. (Year). Title. <em>Journal</em>, vol(issue), pp. DOI</div>
          <div className="font-bold mt-1">Book:</div>
          <div className="font-mono text-xs">Author, A. (Year). <em>Title</em>. Publisher.</div>
          <div className="font-bold mt-1">In-text:</div>
          <div className="font-mono text-xs">(Author, Year, p. #)</div>
        </div>
        <div className="border border-green-300 rounded p-2 bg-green-50 dark:bg-green-950/30">
          <div className="font-bold text-green-700 dark:text-green-300 mb-1">MLA 9th Edition</div>
          <div className="font-bold">Book:</div>
          <div className="font-mono text-xs">Author. <em>Title</em>. Publisher, Year.</div>
          <div className="font-bold mt-1">Article:</div>
          <div className="font-mono text-xs">Author. "Title." <em>Journal</em>, vol., no., Year, pp.</div>
          <div className="font-bold mt-1">In-text:</div>
          <div className="font-mono text-xs">(Author page#)</div>
        </div>
      </div>
    </div>
  );
}

function EnglishCollegeGrammar() {
  const rules = [
    { rule: 'Comma Splice', bad: '"I love coffee, it keeps me awake."', fix: 'Use a semicolon, period, or conjunction' },
    { rule: 'Run-on Sentence', bad: '"She ran he fell."', fix: 'Add punctuation or conjunction' },
    { rule: 'Dangling Modifier', bad: '"Walking home, the rain started."', fix: 'Subject must match modifier' },
    { rule: 'Subject-Verb Agreement', bad: '"The team are playing."(UK OK; US wrong)', fix: 'Team IS playing (US English)' },
    { rule: 'Apostrophe', bad: '"Its a problem." / "The dog\'s are here."', fix: "It's = it is. Dogs' = plural possessive" },
    { rule: 'Passive vs Active', bad: '"The paper was written by me."', fix: '"I wrote the paper." (Active preferred)' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">College-Level Grammar Rules</p>
      {rules.map(({rule,bad,fix})=>(
        <div key={rule} className="border border-border rounded p-1.5">
          <div className="text-xs font-bold text-red-700 dark:text-red-400">{rule}</div>
          <div className="text-xs text-muted-foreground italic">❌ {bad}</div>
          <div className="text-xs text-green-700 dark:text-green-400">✅ {fix}</div>
        </div>
      ))}
    </div>
  );
}

function EnglishRhetoricalDevices() {
  const devices = [
    { name: 'Ethos', def: 'Appeal to credibility/authority', ex: '"As a doctor, I recommend..."' },
    { name: 'Pathos', def: 'Appeal to emotion', ex: 'Stories, vivid imagery, emotional language' },
    { name: 'Logos', def: 'Appeal to logic/reason', ex: 'Statistics, data, logical arguments' },
    { name: 'Anaphora', def: 'Repeating a phrase at the start of sentences', ex: '"We shall fight... We shall never surrender"' },
    { name: 'Chiasmus', def: 'Reversed grammatical structure', ex: '"Ask not what your country can do for you..."' },
    { name: 'Epistrophe', def: 'Repeating words at the end of clauses', ex: '"Government of the people, by the people, for the people"' },
    { name: 'Antithesis', def: 'Contrasting ideas in parallel structure', ex: '"It was the best of times, it was the worst of times"' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Rhetorical Devices & Appeals</p>
      {devices.map(({name,def,ex})=>(
        <div key={name} className="border-l-4 border-indigo-400 pl-2 py-0.5">
          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{name}: </span>
          <span className="text-xs text-muted-foreground">{def}</span>
          <div className="text-xs italic text-foreground/70">{ex}</div>
        </div>
      ))}
    </div>
  );
}

function EnglishLiteraryAnalysis() {
  const elements = [
    { el: 'Theme', def: 'Central message or universal idea the work explores', ex: 'Identity, power, justice, love' },
    { el: 'Motif', def: 'Recurring element that reinforces the theme', ex: 'Light/dark in Romeo & Juliet' },
    { el: 'Symbol', def: 'Object/person representing something larger', ex: 'Green light in Gatsby = American Dream' },
    { el: 'Tone', def: 'Author\'s attitude toward subject', ex: 'Sardonic, melancholic, optimistic' },
    { el: 'Mood', def: 'Emotional atmosphere felt by the reader', ex: 'Ominous, hopeful, tense' },
    { el: 'Point of View', def: '1st (I/we), 2nd (you), 3rd limited/omniscient', ex: '3rd omniscient knows all characters\' thoughts' },
    { el: 'Foil', def: 'Character who contrasts with another to highlight traits', ex: 'Draco Malfoy as foil to Harry Potter' },
    { el: 'Irony', def: 'Verbal (saying opposite), Dramatic (reader knows more), Situational (unexpected outcome)', ex: 'Dramatic: audience knows the villain' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Literary Analysis Terms</p>
      {elements.map(({el,def,ex})=>(
        <div key={el} className="border-l-4 border-violet-400 pl-2 py-0.5">
          <span className="text-xs font-bold text-violet-700 dark:text-violet-300">{el}: </span>
          <span className="text-xs text-muted-foreground">{def}</span>
          <div className="text-xs italic text-foreground/60">{ex}</div>
        </div>
      ))}
    </div>
  );
}

function EnglishCriticalReading() {
  const strategies = [
    { name: 'Annotate', desc: 'Mark key passages, note questions, circle unfamiliar terms while reading' },
    { name: 'Identify Author\'s Purpose', desc: 'Is it to inform, persuade, entertain, or critique? Shapes how you read it.' },
    { name: 'Distinguish Fact vs Opinion', desc: 'Facts = verifiable. Opinion = judgment or interpretation.' },
    { name: 'Evaluate Evidence', desc: 'Is it current? Peer-reviewed? Who funded the study? Any bias?' },
    { name: 'Identify Assumptions', desc: 'What does the author take for granted without proving?' },
    { name: 'Recognize Logical Fallacies', desc: 'Ad hominem, straw man, false dichotomy, slippery slope, appeal to authority' },
    { name: 'Synthesize', desc: 'Connect what you\'re reading to other texts, your knowledge, and the real world.' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Critical Reading Strategies</p>
      {strategies.map(({name,desc})=>(
        <div key={name} className="border-l-4 border-teal-400 pl-2 py-0.5">
          <div className="text-xs font-bold text-teal-700 dark:text-teal-300">{name}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      ))}
    </div>
  );
}

function EnglishPartsOfSpeechAdvanced() {
  const advanced = [
    { name: 'Gerund', def: 'Verb ending in -ing used as a noun', ex: '"Running is healthy." (subject)' },
    { name: 'Infinitive', def: 'To + verb used as noun, adj, or adv', ex: '"To succeed requires effort."' },
    { name: 'Participle', def: 'Verb form used as adjective', ex: '"The broken window" (past participle)' },
    { name: 'Relative Pronoun', def: 'who, whom, which, that — introduces clause', ex: '"The student who studied passed."' },
    { name: 'Subordinating Conj.', def: 'although, because, since, unless, while', ex: '"Although tired, she finished."' },
    { name: 'Coordinating Conj.', def: 'FANBOYS: For, And, Nor, But, Or, Yet, So', ex: '"I studied, but I forgot the material."' },
    { name: 'Appositive', def: 'Noun phrase that renames nearby noun', ex: '"My professor, Dr. Lee, is brilliant."' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Advanced Grammar — Parts of Speech</p>
      {advanced.map(({name,def,ex})=>(
        <div key={name} className="border-l-4 border-pink-400 pl-2 py-0.5">
          <span className="text-xs font-bold text-pink-700 dark:text-pink-300">{name}: </span>
          <span className="text-xs text-muted-foreground">{def}</span>
          <div className="text-xs italic text-foreground/70">{ex}</div>
        </div>
      ))}
    </div>
  );
}

function EnglishLogicalFallacies() {
  const fallacies = [
    { name: 'Ad Hominem', def: 'Attacking the person, not the argument', ex: '"You can\'t trust his climate data — he\'s not likable."' },
    { name: 'Straw Man', def: 'Misrepresenting someone\'s argument to attack it', ex: '"She wants stricter gun laws — so she wants to ban all guns!"' },
    { name: 'False Dichotomy', def: 'Presenting only 2 options when more exist', ex: '"You\'re either with us or against us."' },
    { name: 'Slippery Slope', def: 'Claiming one event will inevitably lead to extreme outcomes', ex: '"If we allow X, society will collapse."' },
    { name: 'Appeal to Authority', def: 'Citing authority as proof without evidence', ex: '"A celebrity endorses this supplement, so it works."' },
    { name: 'Circular Reasoning', def: 'Using the conclusion as a premise', ex: '"The Bible is true because the Bible says so."' },
    { name: 'Hasty Generalization', def: 'Drawing broad conclusions from limited examples', ex: '"Two students failed — this school is terrible."' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Common Logical Fallacies</p>
      {fallacies.map(({name,def,ex})=>(
        <div key={name} className="border-l-4 border-red-400 pl-2 py-0.5">
          <span className="text-xs font-bold text-red-700 dark:text-red-300">{name}: </span>
          <span className="text-xs text-muted-foreground">{def}</span>
          <div className="text-xs italic text-foreground/60">{ex}</div>
        </div>
      ))}
    </div>
  );
}

// ─── STUDY SKILLS — COLLEGE ───────────────────────────────────

function StudyBloomsTaxonomy() {
  const levels = [
    { level: 'Remember', verbs: 'Define, list, recall, identify, name', color: 'bg-red-100 dark:bg-red-900/30', tier: '1 — Lowest' },
    { level: 'Understand', verbs: 'Explain, summarize, classify, describe', color: 'bg-orange-100 dark:bg-orange-900/30', tier: '2' },
    { level: 'Apply', verbs: 'Use, solve, demonstrate, calculate', color: 'bg-yellow-100 dark:bg-yellow-900/30', tier: '3' },
    { level: 'Analyze', verbs: 'Compare, differentiate, examine, break down', color: 'bg-green-100 dark:bg-green-900/30', tier: '4' },
    { level: 'Evaluate', verbs: 'Judge, critique, justify, argue, assess', color: 'bg-blue-100 dark:bg-blue-900/30', tier: '5' },
    { level: 'Create', verbs: 'Design, construct, compose, develop, produce', color: 'bg-purple-100 dark:bg-purple-900/30', tier: '6 — Highest' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Bloom's Taxonomy (Revised)</p>
      <div className="text-xs text-muted-foreground text-center mb-1">College coursework targets levels 4–6</div>
      {[...levels].reverse().map(({level,verbs,color,tier})=>(
        <div key={level} className={`${color} rounded px-2 py-1.5 flex items-start gap-2`}>
          <div className="w-20 shrink-0">
            <div className="text-xs font-black">{level}</div>
            <div className="text-muted-foreground" style={{fontSize:'9px'}}>{tier}</div>
          </div>
          <div className="text-xs text-muted-foreground italic">{verbs}</div>
        </div>
      ))}
    </div>
  );
}

function StudyTimeManagement() {
  const methods = [
    { name: 'Pomodoro', desc: '25 min focus → 5 min break. After 4 rounds, take 20–30 min break.', color: 'border-red-400' },
    { name: 'Time Blocking', desc: 'Schedule specific tasks in calendar blocks. Defend those blocks.', color: 'border-blue-400' },
    { name: 'Eisenhower Matrix', desc: 'Sort tasks: Urgent+Important (do now), Important+Not Urgent (schedule), Urgent+Not Important (delegate), Neither (eliminate).', color: 'border-green-400' },
    { name: '2-Minute Rule', desc: 'If a task takes less than 2 minutes, do it immediately.', color: 'border-yellow-400' },
    { name: 'Weekly Review', desc: 'Every Sunday: review upcoming deadlines, plan the week, clear backlog.', color: 'border-purple-400' },
  ];
  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">College Time Management Strategies</p>
      {methods.map(({name,desc,color})=>(
        <div key={name} className={`border-l-4 ${color} pl-2 py-1`}>
          <div className="text-xs font-bold">{name}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      ))}
    </div>
  );
}



function renderVisual(tag: VisualTag) {
  // Check for WebP image-based visual first
  const imagePath = IMAGE_VISUALS[tag];
  if (imagePath) {
    const label = VISUAL_LABELS[tag] ?? tag;
    return (
      <img
        src={imagePath}
        alt={label}
        style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain', borderRadius: '8px' }}
        loading="lazy"
      />
    );
  }
  switch (tag) {
    // Math — Early
    case 'math_counting_1_20': return <MathCounting120 />;
    case 'math_simple_addition_table': return <MathSimpleAdditionTable />;
    case 'math_simple_subtraction_table': return <MathSimpleSubtractionTable />;
    case 'math_multiplication_table': return <MathMultiplicationTable />;
    case 'math_fractions': return <MathFractions />;
    case 'math_place_value': return <MathPlaceValue />;
    case 'math_number_line': return <MathNumberLine />;
    case 'math_shapes_basic': return <MathShapesBasic />;
    // Math — Intermediate / Advanced
    case 'math_area_model': return <MathAreaModel />;
    case 'math_order_of_operations': return <MathOrderOfOperations />;
    case 'math_percent_diagram': return <MathPercentDiagram />;
    case 'math_algebra_balance': return <MathAlgebraBalance />;
    case 'math_coordinate_plane': return <MathCoordinatePlane />;
    case 'math_geometry_shapes': return <MathGeometryShapes />;
    case 'math_advanced_formulas': return <MathAdvancedFormulas />;
    case 'math_trig_unit_circle': return <MathTrigUnitCircle />;
    case 'math_statistics_chart': return <MathStatisticsChart />;
    // Writing / ELA
    case 'writing_paragraph_structure': return <WritingParagraphStructure />;
    case 'writing_essay_outline': return <WritingEssayOutline />;
    case 'writing_story_elements': return <WritingStoryElements />;
    case 'writing_figurative_language': return <WritingFigurativeLanguage />;
    // Grammar / Reading
    case 'grammar_sentence_parts': return <GrammarSentenceParts />;
    case 'grammar_parts_of_speech': return <GrammarPartsOfSpeech />;
    case 'reading_main_idea': return <ReadingMainIdea />;
    case 'reading_compare_contrast': return <ReadingCompareContrast />;
    case 'reading_cause_effect': return <ReadingCauseEffect />;
    case 'reading_text_structure': return <ReadingTextStructure />;
    // Language — Alphabets
    case 'lang_alphabet_english': return <LangAlphabetEnglish />;
    case 'lang_alphabet_spanish': return <LangAlphabetSpanish />;
    case 'lang_alphabet_french': return <LangAlphabetFrench />;
    case 'lang_alphabet_japanese': return <LangAlphabetJapanese />;
    case 'lang_alphabet_chinese': return <LangAlphabetChinese />;
    // Science
    case 'science_cell_diagram': return <ScienceCellDiagram />;
    case 'science_water_cycle': return <ScienceWaterCycle />;
    case 'science_food_chain': return <ScienceFoodChain />;
    case 'science_scientific_method': return <ScienceScientificMethod />;
    case 'science_states_of_matter': return <ScienceStatesOfMatter />;
    case 'science_human_body_systems': return <ScienceHumanBodySystems />;
    case 'science_solar_system': return <ScienceSolarSystem />;
    case 'periodic_table_simplified': return <PeriodicTableSimplified />;
    // History / Social Studies
    case 'history_timeline': return <HistoryTimeline />;
    case 'history_cause_effect_chain': return <HistoryCauseEffectChain />;
    case 'history_three_branches': return <HistoryThreeBranches />;
    case 'history_map_compass': return <HistoryMapCompass />;
    // Geography
    case 'geography_continents': return <GeographyContinents />;
    // Economics
    case 'economics_supply_demand': return <EconomicsSupplyDemand />;
    // Study Skills
    case 'study_skills_kwl': return <StudySkillsKWL />;
    case 'study_skills_concept_map': return <StudySkillsConceptMap />;
    case 'study_skills_cornell_notes': return <StudySkillsCornellNotes />;
    case 'math_calculus_derivatives': return <MathCalculusDerivatives />;
    case 'math_calculus_integrals': return <MathCalculusIntegrals />;
    case 'math_limits': return <MathLimits />;
    case 'math_linear_algebra': return <MathLinearAlgebra />;
    case 'math_probability_stats': return <MathProbabilityStats />;
    case 'math_logarithms': return <MathLogarithms />;
    case 'lang_german_alphabet': return <LangGermanAlphabet />;
    case 'lang_korean_hangul': return <LangKoreanHangul />;
    case 'lang_arabic_alphabet': return <LangArabicAlphabet />;
    case 'lang_russian_cyrillic': return <LangRussianCyrillic />;
    case 'lang_japanese_katakana': return <LangJapaneseKatakana />;
    case 'lang_spanish_verb_conjugation': return <LangSpanishVerbConjugation />;
    case 'lang_french_verb_conjugation': return <LangFrenchVerbConjugation />;
    case 'lang_chinese_tones': return <LangChineseTones />;
    case 'geography_usa_map': return <GeographyUSAMap />;
    case 'geography_world_map': return <GeographyWorldMap />;
    case 'geography_europe_map': return <GeographyEuropeMap />;
    case 'geography_africa_map': return <GeographyAfricaMap />;
    case 'geography_north_america_map': return <GeographyNorthAmericaMap />;
    case 'geography_asia_map': return <GeographyAsiaMap />;
    case 'geography_greenland_map': return <GeographyGreenlandMap />;
    case 'geography_south_america_map': return <GeographySouthAmericaMap />;
    case 'geography_australia_map': return <GeographyAustraliaMap />;
    case 'geography_lat_long': return <GeographyLatLong />;
    case 'physics_newtons_laws': return <PhysicsNewtonsLaws />;
    case 'physics_electromagnetic_spectrum': return <PhysicsElectromagneticSpectrum />;
    case 'physics_formulas': return <PhysicsFormulas />;
    case 'physics_thermodynamics': return <PhysicsThermodynamics />;
    case 'science_atomic_structure': return <ScienceAtomicStructure />;
    case 'science_chemical_bonding': return <ScienceChemicalBonding />;
    case 'science_dna_genetics': return <ScienceDNAGenetics />;
    case 'science_punnett_square': return <SciencePunnettSquare />;
    case 'economics_gdp': return <EconomicsGDP />;
    case 'economics_market_structures': return <EconomicsMarketStructures />;
    case 'economics_fiscal_monetary': return <EconomicsFiscalMonetary />;
    case 'economics_comparative_advantage': return <EconomicsComparativeAdvantage />;
    case 'polisci_constitution': return <PoliSciConstitution />;
    case 'polisci_bill_of_rights': return <PoliSciBillOfRights />;
    case 'polisci_world_governments': return <PoliSciWorldGovernments />;
    case 'english_thesis_development': return <EnglishThesisDevelopment />;
    case 'english_argument_structure': return <EnglishArgumentStructure />;
    case 'english_research_paper_structure': return <EnglishResearchPaperStructure />;
    case 'english_citation_formats': return <EnglishCitationFormats />;
    case 'english_college_grammar': return <EnglishCollegeGrammar />;
    case 'english_rhetorical_devices': return <EnglishRhetoricalDevices />;
    case 'english_literary_analysis': return <EnglishLiteraryAnalysis />;
    case 'english_critical_reading': return <EnglishCriticalReading />;
    case 'english_parts_of_speech_advanced': return <EnglishPartsOfSpeechAdvanced />;
    case 'english_logical_fallacies': return <EnglishLogicalFallacies />;
    case 'study_blooms_taxonomy': return <StudyBloomsTaxonomy />;
    case 'study_time_management': return <StudyTimeManagement />;
    default: return null;
  }
}

const VISUAL_LABELS: Record<VisualTag, string> = {
  math_counting_1_20: 'Counting 1–20',
  math_simple_addition_table: 'Addition Table',
  math_simple_subtraction_table: 'Subtraction Table',
  math_multiplication_table: 'Multiplication Table',
  math_fractions: 'Fraction Bars',
  math_place_value: 'Place Value Chart',
  math_number_line: 'Number Line',
  math_shapes_basic: 'Basic Shapes',
  math_area_model: 'Area Model',
  math_order_of_operations: 'Order of Operations',
  math_percent_diagram: 'Percent Diagram',
  math_algebra_balance: 'Algebra Balance',
  math_coordinate_plane: 'Coordinate Plane',
  math_geometry_shapes: 'Geometry Shapes',
  math_advanced_formulas: 'Advanced Formulas',
  math_trig_unit_circle: 'Trig Unit Circle',
  math_statistics_chart: 'Statistics Reference',
  writing_paragraph_structure: 'Paragraph Structure',
  writing_essay_outline: 'Essay Outline',
  writing_story_elements: 'Story Elements',
  writing_figurative_language: 'Figurative Language',
  grammar_sentence_parts: 'Sentence Parts',
  grammar_parts_of_speech: 'Parts of Speech',
  reading_main_idea: 'Main Idea Map',
  reading_compare_contrast: 'Compare & Contrast',
  reading_cause_effect: 'Cause & Effect',
  reading_text_structure: 'Text Structures',
  lang_alphabet_english: 'English Alphabet',
  lang_alphabet_spanish: 'Spanish Alphabet',
  lang_alphabet_french: 'French Alphabet',
  lang_alphabet_japanese: 'Japanese Hiragana',
  lang_alphabet_chinese: 'Chinese Characters',
  science_cell_diagram: 'Cell Diagram',
  science_water_cycle: 'Water Cycle',
  science_food_chain: 'Food Chain',
  science_scientific_method: 'Scientific Method',
  science_states_of_matter: 'States of Matter',
  science_human_body_systems: 'Human Body Systems',
  science_solar_system: 'Solar System',
  periodic_table_simplified: 'Common Elements',
  history_timeline: 'Timeline',
  history_cause_effect_chain: 'Cause & Effect Chain',
  history_three_branches: 'Three Branches of Gov.',
  history_map_compass: 'Map & Compass',
  geography_continents: '7 Continents',
  economics_supply_demand: 'Supply & Demand',
  study_skills_kwl: 'KWL Chart',
  study_skills_concept_map: 'Concept Map',
  study_skills_cornell_notes: 'Cornell Notes',
  math_calculus_derivatives: 'Derivative Rules',
  math_calculus_integrals: 'Common Integrals',
  math_limits: 'Limits Reference',
  math_linear_algebra: 'Linear Algebra',
  math_probability_stats: 'Probability & Stats',
  math_logarithms: 'Logarithm Rules',
  lang_german_alphabet: 'German Alphabet',
  lang_korean_hangul: 'Korean Hangul',
  lang_arabic_alphabet: 'Arabic Alphabet',
  lang_russian_cyrillic: 'Russian Cyrillic',
  lang_japanese_katakana: 'Japanese Katakana',
  lang_spanish_verb_conjugation: 'Spanish Verb Conjugation',
  lang_french_verb_conjugation: 'French Verb Conjugation',
  lang_chinese_tones: 'Mandarin Tones',
  geography_usa_map: 'USA — All 50 States',
  geography_world_map: 'World Map',
  geography_europe_map: 'Europe — Countries',
  geography_africa_map: 'Africa — Countries',
  geography_north_america_map: 'North America',
  geography_asia_map: 'Asia Map',
  geography_greenland_map: 'Greenland',
  geography_south_america_map: 'South America',
  geography_australia_map: 'Australia & Oceania',
  geography_lat_long: 'Latitude & Longitude',
  physics_newtons_laws: "Newton's Laws of Motion",
  physics_electromagnetic_spectrum: 'Electromagnetic Spectrum',
  physics_formulas: 'Physics Formula Sheet',
  physics_thermodynamics: 'Laws of Thermodynamics',
  science_atomic_structure: 'Atomic Structure',
  science_chemical_bonding: 'Chemical Bonds',
  science_dna_genetics: 'DNA & Genetics',
  science_punnett_square: 'Punnett Square',
  economics_gdp: 'GDP & Macroeconomics',
  economics_market_structures: 'Market Structures',
  economics_fiscal_monetary: 'Fiscal vs Monetary Policy',
  economics_comparative_advantage: 'Comparative Advantage',
  polisci_constitution: 'U.S. Constitution',
  polisci_bill_of_rights: 'Bill of Rights',
  polisci_world_governments: 'Government Systems',
  english_thesis_development: 'Thesis Development',
  english_argument_structure: 'Argumentative Writing',
  english_research_paper_structure: 'Research Paper Structure',
  english_citation_formats: 'APA & MLA Citations',
  english_college_grammar: 'College Grammar Rules',
  english_rhetorical_devices: 'Rhetorical Devices',
  english_literary_analysis: 'Literary Analysis Terms',
  english_critical_reading: 'Critical Reading Strategies',
  english_parts_of_speech_advanced: 'Advanced Parts of Speech',
  english_logical_fallacies: 'Logical Fallacies',
  study_blooms_taxonomy: "Bloom's Taxonomy",
  study_time_management: 'Time Management Strategies',
  // Math — Formula Images
  math_order_of_operations_visual: 'Order of Operations (PEMDAS)',
  math_quadratic_formula: 'The Quadratic Formula',
  math_area_formulas: 'Area Formulas',
  math_volume_formulas: 'Volume Formulas',
  math_trig_sohcahtoa: 'Trigonometry — SOH-CAH-TOA',
  math_exponent_rules: 'Exponent Rules',
  math_log_rules: 'Logarithm Rules Reference',
  math_distance_midpoint: 'Distance & Midpoint Formulas',
  math_fraction_operations: 'Fraction Operations',
  math_mean_median_mode: 'Mean, Median, Mode & Range',
  math_inequality_symbols: 'Inequality Symbols',
  math_coordinate_plane_quadrants: 'Coordinate Plane Quadrants',
  math_slope_intercept_form: 'Slope-Intercept Form (y = mx + b)',
  math_systems_of_equations: 'Solving Systems of Equations',
  math_polynomial_operations: 'Polynomial Operations (FOIL)',
};

// ─── VisualPanel Component ─────────────────────────────────────────────────

interface VisualPanelProps {
  visualTag: VisualTag | null;
  onDismiss: () => void;
}

export function VisualPanel({ visualTag, onDismiss }: VisualPanelProps) {
  // Latch the last valid visual tag so brief null flickers during re-renders
  // don't cause the panel to disappear. Only an explicit dismiss clears it.
  const latchedTagRef = useRef<VisualTag | null>(null);

  if (visualTag) {
    latchedTagRef.current = visualTag;
  }

  const activeTag = latchedTagRef.current;
  if (!activeTag) return null;

  const label = VISUAL_LABELS[activeTag] ?? activeTag;
  const content = renderVisual(activeTag);
  if (!content) return null;

  const handleDismiss = () => {
    latchedTagRef.current = null;
    onDismiss();
  };

  return (
    <div className="w-full flex-shrink-0 flex flex-col border-b-2 border-border bg-background overflow-hidden" style={{maxHeight: '270px'}}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/60 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📊 Visual Aid</span>
          <span className="text-sm font-bold text-foreground">{label}</span>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Dismiss visual">
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Content — image visuals fill width naturally; SVG components scaled up 1.4x for readability */}
      <div className="flex-1 overflow-y-auto overflow-x-auto p-3">
        {IMAGE_VISUALS[activeTag]
          ? content
          : (
            <div style={{ transform: 'scale(1.4)', transformOrigin: 'top center', paddingBottom: '40%' }}>
              {content}
            </div>
          )
        }
      </div>
    </div>
  );
}
