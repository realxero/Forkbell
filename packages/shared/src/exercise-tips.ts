// Coaching written for each built-in exercise: where you should feel it, the
// signs it's too heavy (or too hard), and ways to make that exercise harder
// without just adding weight. Looked up by name; exercises not listed here
// (the wider library, your own) fall back to the movement-pattern cues in
// cues.ts and the general ideas in variations.ts.
import type { ProgressIdea } from './variations.ts';
import { LIBRARY_TIPS } from './library-tips.ts';

export interface ExerciseTips {
  feel: string;
  tooHeavy: string[];
  /** specific to this exercise; shown before the general ideas that still apply */
  progress: ProgressIdea[];
}

const p = (key: string, title: string, detail: string): ProgressIdea => ({ key, title, detail });

const TIPS: Record<string, ExerciseTips> = {
  // Chest
  'bench press': {
    feel: 'Your chest, with the front of your shoulders and triceps helping. Shoulder blades stay pinned back.',
    tooHeavy: ['Your butt lifts off the bench', 'The bar drifts toward your face or bounces off your chest', 'Your elbows flare straight out to the sides'],
    progress: [p('pause', 'Pause on the chest', 'Stop the bar on your chest for a full second, then press. No bounce.'), p('slow', 'Slow the lowering', 'Take 3 seconds to bring the bar down to your chest.'), p('close', 'Close-grip sets', 'Move your hands in a few inches for a back-off set: more triceps, same chest work.')],
  },
  'incline bench press': {
    feel: 'Your upper chest, just under the collarbones, and the front of your shoulders.',
    tooHeavy: ['Your back arches until it’s a flat bench press', 'The bar touches low on your stomach instead of your upper chest', 'One side of the bar rises before the other'],
    progress: [p('pause', 'Pause on the chest', 'A one-second stop just below the collarbones each rep.'), p('angle', 'Raise the bench a notch', 'A steeper angle shifts more work to the upper chest and shoulders.')],
  },
  'dumbbell bench press': {
    feel: 'Your chest, through a longer stretch than the barbell allows.',
    tooHeavy: ['The dumbbells drift apart or wobble at the bottom', 'You can’t get them into place without help', 'One arm finishes well behind the other'],
    progress: [p('deep', 'Deeper stretch', 'Let the dumbbells sink just below chest level, under control.'), p('alternate', 'Alternating presses', 'Hold one up while the other presses. Your chest works the whole set.')],
  },
  'incline dumbbell press': {
    feel: 'Your upper chest and the front of your shoulders.',
    tooHeavy: ['Your shoulders roll forward at the top', 'You arch your back to finish a rep', 'The dumbbells clash or drift apart'],
    progress: [p('slow', 'Slow the lowering', '3 seconds down to a deep stretch, then press.'), p('neutral', 'Palms facing', 'Turn your palms in for a set: easier on the shoulders, harder on the chest.')],
  },
  'machine chest press': {
    feel: 'Your chest, without having to balance the weight.',
    tooHeavy: ['Your shoulders lift off the pad', 'Your lower back leaves the seat', 'You can’t stop the handles from slamming back'],
    progress: [p('side', 'One arm at a time', 'Press each side alone: the same weight feels much heavier.'), p('hold', 'Squeeze at the front', 'Hold the handles at full reach for 2 seconds each rep.')],
  },
  'cable fly': {
    feel: 'Your chest, as your arms hug inward. Not your biceps or shoulders.',
    tooHeavy: ['Your arms bend more and it turns into a press', 'The cables pull you off balance', 'You lose the stretch at the back of the rep'],
    progress: [p('squeeze', 'Squeeze and hold', 'Hold the handles together for 2 seconds each rep.'), p('angle', 'Change the height', 'High to low for lower chest, low to high for upper chest.')],
  },
  'dumbbell fly': {
    feel: 'A stretch across your chest at the bottom, then your chest pulling the weights together.',
    tooHeavy: ['Your elbows bend more and more until it’s a press', 'You feel it in the front of your shoulder, not your chest', 'You can’t control the bottom of the rep'],
    progress: [p('slow', 'Slow the stretch', '3 seconds down, a one-second pause at the bottom.'), p('incline', 'On an incline', 'Set the bench at about 30° for more upper chest.')],
  },
  'push-up': {
    feel: 'Your chest and triceps, with your abs holding you in a straight line.',
    tooHeavy: ['Your hips sag or pike up', 'You stop short of your chest reaching the floor', 'Your elbows flare straight out'],
    progress: [p('feet-up', 'Feet up', 'Put your feet on a bench or step: more weight on your hands.'), p('deficit', 'Deficit push-ups', 'Hands on plates or blocks so your chest goes lower than your hands.'), p('pause', 'Pause at the bottom', 'Hold a second with your chest just off the floor.'), p('load', 'Add a little weight', 'A weight vest or a plate on your back once 20 clean reps are easy.')],
  },
  dip: {
    feel: 'Your lower chest and triceps. Leaning forward works more chest; staying upright, more triceps.',
    tooHeavy: ['Your shoulders roll forward or feel pinched at the bottom', 'You can’t reach upper arms parallel to the floor', 'You swing to get out of the bottom'],
    progress: [p('pause', 'Pause at the bottom', 'A one-second stop with your upper arms level with the floor.'), p('slow', 'Slow the lowering', 'Take 3 seconds on the way down.'), p('load', 'Add weight', 'A dip belt or a dumbbell between your feet once 12 clean reps are easy.')],
  },
  // Back
  deadlift: {
    feel: 'Your glutes, hamstrings and the whole length of your back, holding still while your hips drive.',
    tooHeavy: ['Your lower back rounds as the bar leaves the floor', 'Your hips shoot up before the bar moves', 'The bar drifts away from your legs'],
    progress: [p('pause', 'Pause below the knee', 'Stop the bar just under your knees for a second on the way up.'), p('deficit', 'Deficit deadlifts', 'Stand on a 1–2 inch plate: a longer pull from the floor.'), p('reset', 'Dead-stop reps', 'Let the bar settle fully on the floor every rep. No bounce.')],
  },
  'barbell row': {
    feel: 'Your upper and middle back, pulling your elbows behind you.',
    tooHeavy: ['Your torso rises toward standing to finish a rep', 'You jerk the bar up with your legs and back', 'The bar stops short of your stomach'],
    progress: [p('pause', 'Pause at the top', 'Hold the bar against your stomach for a second.'), p('pendlay', 'Pendlay rows', 'Start each rep from the floor with your back flat: strict, no momentum.')],
  },
  'one-arm dumbbell row': {
    feel: 'Your lat, along the side of your back, as your elbow drives toward your hip.',
    tooHeavy: ['Your torso twists open to lift the weight', 'You yank it up with your arm instead of your back', 'You lose the stretch at the bottom'],
    progress: [p('pause', 'Pause at the top', 'Hold the dumbbell at your hip for 2 seconds.'), p('stretch', 'Longer stretch', 'Let your shoulder reach toward the floor at the bottom of each rep.')],
  },
  'pull-up': {
    feel: 'Your lats, the wide muscles under your armpits, with your biceps helping.',
    tooHeavy: ['You kick or swing to get up', 'Your chin doesn’t clear the bar', 'You drop from the top instead of lowering'],
    progress: [p('slow', 'Slow the lowering', 'Take 3–5 seconds to come down from the top.'), p('pause', 'Pause at the top', 'Hold your chin over the bar for 2 seconds.'), p('load', 'Add weight', 'A dip belt or a dumbbell between your feet once 10 clean reps are easy.'), p('band', 'Not there yet?', 'Use a band or do slow lowerings from the top until you can do full reps.')],
  },
  'chin-up': {
    feel: 'Your lats and biceps, more biceps than a pull-up.',
    tooHeavy: ['You swing or kick to finish', 'Your chin doesn’t clear the bar', 'Your shoulders shrug up to your ears at the bottom'],
    progress: [p('slow', 'Slow the lowering', '3–5 seconds down from the top.'), p('pause', 'Pause half way', 'Stop for a second with your elbows at 90° on the way up.'), p('load', 'Add weight', 'A dip belt once 10 clean reps are easy.')],
  },
  'lat pulldown': {
    feel: 'Your lats, pulling your elbows down to your sides.',
    tooHeavy: ['You lean far back and swing the weight', 'The bar stops above your chin', 'The weight stack slams at the top'],
    progress: [p('pause', 'Pause at the chest', 'Hold the bar at your upper chest for a second.'), p('side', 'One arm at a time', 'Use a single handle and pull each side alone.')],
  },
  'seated cable row': {
    feel: 'Your middle back, squeezing your shoulder blades together.',
    tooHeavy: ['You rock back and forth to move the weight', 'Your shoulders round forward at the finish', 'You can’t touch the handle to your stomach'],
    progress: [p('pause', 'Squeeze and hold', 'Hold the handle at your stomach for 2 seconds.'), p('stretch', 'Longer reach', 'Let your shoulders reach forward at the start, without rounding your back.')],
  },
  'chest-supported row': {
    feel: 'Your upper back, with no help from your lower back or legs.',
    tooHeavy: ['Your chest lifts off the pad', 'You shrug instead of pulling your elbows back', 'The reps get short'],
    progress: [p('pause', 'Pause at the top', 'Hold for 2 seconds with your shoulder blades squeezed.'), p('side', 'One arm at a time', 'Row each side alone with the same weight.')],
  },
  'face pull': {
    feel: 'The back of your shoulders and your upper back. Light and controlled.',
    tooHeavy: ['You lean back to pull it', 'Your hands don’t finish beside your ears', 'Your elbows drop below your shoulders'],
    progress: [p('pause', 'Hold the finish', 'Hold for 2 seconds with your hands beside your ears.'), p('reps', 'More reps', 'Work up to 20 clean reps before adding weight.')],
  },
  'back extension': {
    feel: 'Your lower back, glutes and hamstrings, raising your body into one straight line.',
    tooHeavy: ['You swing up with momentum', 'You arch past straight at the top', 'You feel a pinch in your lower back'],
    progress: [p('hold', 'Hold at the top', 'Pause for 3 seconds in a straight line.'), p('load', 'Hold a plate', 'Hug a plate or dumbbell to your chest once 15 clean reps are easy.'), p('side', 'One leg', 'Do it with one foot under the pad.')],
  },
  // Shoulders
  'overhead press': {
    feel: 'The front of your shoulders and your triceps, with your glutes and abs tight to keep you upright.',
    tooHeavy: ['You lean back so it becomes an incline press', 'You bend your knees to push it up', 'The bar travels out in front of you instead of up'],
    progress: [p('pause', 'Pause at the forehead', 'Stop the bar at forehead height for a second on the way up.'), p('slow', 'Slow the lowering', '3 seconds back down to your collarbones.')],
  },
  'dumbbell shoulder press': {
    feel: 'Your shoulders, each side working on its own.',
    tooHeavy: ['Your lower back arches off the bench', 'The dumbbells drift forward or apart', 'One arm stalls well before the other'],
    progress: [p('standing', 'Stand up', 'Press standing: your core has to hold you steady.'), p('alternate', 'Alternating presses', 'Hold one overhead while the other presses.')],
  },
  'lateral raise': {
    feel: 'The side of your shoulders. Not your neck or traps.',
    tooHeavy: ['You shrug or swing the weights up', 'Your hands rise above your elbows', 'You can’t lift them to shoulder height'],
    progress: [p('pause', 'Pause at the top', 'Hold at shoulder height for 2 seconds.'), p('slow', 'Slow the lowering', '3 seconds back down.'), p('partials', 'Partials at the end', 'When full reps stop, add 5 half-reps from the bottom.')],
  },
  'cable lateral raise': {
    feel: 'The side of your shoulder, with tension all the way down.',
    tooHeavy: ['You lean away to swing it up', 'You shrug as you lift', 'The handle stops below shoulder height'],
    progress: [p('pause', 'Pause at the top', 'Hold at shoulder height for 2 seconds.'), p('behind', 'Cable behind you', 'Run the cable behind your back for a longer stretch.')],
  },
  'rear delt fly': {
    feel: 'The back of your shoulders. Light weights, strict reps.',
    tooHeavy: ['You squeeze your shoulder blades so your back takes over', 'Your torso rises to swing the weights', 'Your arms bend into a row'],
    progress: [p('pause', 'Pause at the top', 'Hold for 2 seconds with your arms out wide.'), p('reps', 'More reps', 'Work up to 20 clean reps before adding weight.')],
  },
  'machine shoulder press': {
    feel: 'Your shoulders and triceps, without having to balance.',
    tooHeavy: ['Your back arches off the pad', 'Your shoulders shrug up', 'You can’t lower the handles to shoulder height'],
    progress: [p('side', 'One arm at a time', 'Press each side alone.'), p('slow', 'Slow the lowering', '3 seconds down.')],
  },
  // Arms
  'barbell curl': {
    feel: 'The front of your upper arms. Your elbows stay at your sides.',
    tooHeavy: ['You swing the bar up with your hips', 'Your elbows drift forward', 'You stop half way up'],
    progress: [p('slow', 'Slow the lowering', '3 seconds down to straight arms.'), p('pause', 'Pause half way', 'Stop for 2 seconds with your forearms level with the floor.'), p('21s', '21s', '7 bottom halves, 7 top halves, 7 full reps.')],
  },
  'dumbbell curl': {
    feel: 'Your biceps, turning your palms up as you lift.',
    tooHeavy: ['You swing your body to start each rep', 'Your elbows move forward', 'You don’t reach full straight arms at the bottom'],
    progress: [p('incline', 'Incline curls', 'Sit back on an incline bench: a longer stretch on the biceps.'), p('slow', 'Slow the lowering', '3 seconds down.')],
  },
  'hammer curl': {
    feel: 'The outside of your upper arm and your forearm. Palms face each other.',
    tooHeavy: ['You swing the weights', 'Your wrists bend', 'Your elbows drift forward'],
    progress: [p('cross', 'Across the body', 'Curl each dumbbell toward the opposite shoulder.'), p('slow', 'Slow the lowering', '3 seconds down.')],
  },
  'cable curl': {
    feel: 'Your biceps, with tension even at the bottom.',
    tooHeavy: ['You lean back to pull it up', 'Your elbows leave your sides', 'The weight stack slams down'],
    progress: [p('squeeze', 'Squeeze at the top', 'Hold for 2 seconds with your biceps fully tight.'), p('side', 'One arm at a time', 'Use a single handle.')],
  },
  'preacher curl': {
    feel: 'Your biceps, especially near the stretch at the bottom.',
    tooHeavy: ['Your elbows lift off the pad', 'You can’t control the bottom of the rep', 'Your shoulders rise to help'],
    progress: [p('slow', 'Slow the lowering', '3–4 seconds down to nearly straight.'), p('side', 'One arm at a time', 'Curl with one dumbbell.')],
  },
  'triceps pushdown': {
    feel: 'The back of your upper arms. Elbows stay pinned at your sides.',
    tooHeavy: ['You lean over the bar and push with your body', 'Your elbows drift forward and back', 'You don’t reach straight arms'],
    progress: [p('squeeze', 'Squeeze at the bottom', 'Hold your arms straight for 2 seconds.'), p('side', 'One arm at a time', 'Use a single handle, palm down or up.')],
  },
  'overhead triceps extension': {
    feel: 'The back of your upper arms, with a big stretch behind your head.',
    tooHeavy: ['Your elbows flare wide', 'Your lower back arches', 'You feel it in your elbows, not your triceps'],
    progress: [p('slow', 'Slow the stretch', '3 seconds down and a pause at the bottom.'), p('side', 'One arm at a time', 'Use a single handle.')],
  },
  'skull crusher': {
    feel: 'The back of your upper arms. Your upper arms stay still.',
    tooHeavy: ['Your elbows flare out', 'Your upper arms swing back and forth', 'Your elbows ache during the set'],
    progress: [p('behind', 'Lower behind your head', 'Bring the bar just past your head for a longer stretch.'), p('slow', 'Slow the lowering', '3 seconds down.')],
  },
  'close-grip bench press': {
    feel: 'Your triceps, with your chest helping. Elbows stay close to your sides.',
    tooHeavy: ['Your elbows flare out', 'Your wrists bend back', 'The bar bounces off your chest'],
    progress: [p('pause', 'Pause on the chest', 'A full one-second stop on your chest.'), p('slow', 'Slow the lowering', '3 seconds down.')],
  },
  // Legs
  'back squat': {
    feel: 'The front of your thighs and your glutes, pushing through the whole foot.',
    tooHeavy: ['Your knees cave inward', 'Your heels lift or you tip onto your toes', 'You can’t reach your usual depth', 'Your lower back rounds at the bottom'],
    progress: [p('pause', 'Pause at the bottom', 'Hold 2 seconds in the hole, then stand.'), p('slow', 'Slow the lowering', '3 seconds down.'), p('depth', 'Deeper', 'Go a little lower each week while your back stays flat.')],
  },
  'front squat': {
    feel: 'The front of your thighs and your upper back, staying tall.',
    tooHeavy: ['Your elbows drop and the bar rolls forward', 'Your chest falls toward your knees', 'Your knees cave in'],
    progress: [p('pause', 'Pause at the bottom', 'Hold 2 seconds at the bottom.'), p('slow', 'Slow the lowering', '3 seconds down.')],
  },
  'goblet squat': {
    feel: 'Your thighs and glutes, with the weight held at your chest.',
    tooHeavy: ['You can’t hold the weight at your chest for the whole set', 'Your chest drops forward', 'Your heels lift'],
    progress: [p('pause', 'Pause at the bottom', 'Hold 3 seconds deep, elbows inside your knees.'), p('slow', 'Slow the lowering', '4 seconds down.'), p('heel', 'Heels raised', 'Heels on a small plate for more thigh.')],
  },
  'leg press': {
    feel: 'Your thighs and glutes. Your lower back stays on the pad.',
    tooHeavy: ['Your lower back or hips curl off the seat at the bottom', 'Your knees cave in', 'You can’t go deeper than a quarter rep'],
    progress: [p('pause', 'Pause at the bottom', 'Hold 2 seconds at full depth.'), p('side', 'One leg at a time', 'Same weight, one leg: much harder.'), p('feet', 'Feet lower on the platform', 'More work for the front of your thighs.')],
  },
  'hack squat': {
    feel: 'The front of your thighs, deep in the bottom.',
    tooHeavy: ['Your heels lift', 'Your hips come off the pad', 'You can’t reach thighs parallel to the platform'],
    progress: [p('pause', 'Pause at the bottom', 'Hold 2 seconds deep.'), p('slow', 'Slow the lowering', '3 seconds down.')],
  },
  'bulgarian split squat': {
    feel: 'The front thigh and glute of your front leg. The back leg is just for balance.',
    tooHeavy: ['You lose your balance', 'Your front knee caves in', 'You push off the back foot'],
    progress: [p('pause', 'Pause at the bottom', 'Hold 2 seconds with your back knee just off the floor.'), p('deficit', 'Front foot raised', 'Front foot on a small plate for a deeper stretch.')],
  },
  'walking lunge': {
    feel: 'Your thighs and glutes, each leg in turn.',
    tooHeavy: ['Your back knee slams the floor', 'You wobble side to side', 'Your steps get shorter'],
    progress: [p('longer-step', 'Longer steps', 'A longer step works the glutes more.'), p('distance', 'More steps', 'Add 2 steps a leg each week.')],
  },
  'leg extension': {
    feel: 'The front of your thighs, squeezing at the top.',
    tooHeavy: ['You kick the weight up', 'Your hips lift off the seat', 'You can’t reach straight legs'],
    progress: [p('squeeze', 'Squeeze at the top', 'Hold straight legs for 2 seconds.'), p('side', 'One leg at a time', 'Same weight, one leg.')],
  },
  'romanian deadlift': {
    feel: 'A stretch in your hamstrings as you push your hips back, then your glutes standing you up.',
    tooHeavy: ['Your back rounds', 'The bar drifts away from your legs', 'Your knees bend more and more until it’s a squat'],
    progress: [p('slow', 'Slow the lowering', '3–4 seconds down to the stretch.'), p('pause', 'Pause in the stretch', 'Hold 2 seconds at the bottom.'), p('side', 'One leg', 'Single-leg Romanian deadlifts with a dumbbell.')],
  },
  'dumbbell romanian deadlift': {
    feel: 'Your hamstrings stretching, then your glutes.',
    tooHeavy: ['Your back rounds', 'The dumbbells swing away from your legs', 'You bend your knees to reach lower'],
    progress: [p('slow', 'Slow the lowering', '3–4 seconds down.'), p('side', 'One leg', 'Do them on one leg, the other leg reaching back.')],
  },
  'lying leg curl': {
    feel: 'The back of your thighs. Your hips stay on the pad.',
    tooHeavy: ['Your hips lift off the pad', 'You jerk the weight up', 'You can’t bring the pad toward your glutes'],
    progress: [p('squeeze', 'Squeeze at the top', 'Hold for 2 seconds.'), p('slow', 'Slow the lowering', '3 seconds down.'), p('side', 'One leg at a time', 'Same weight, one leg.')],
  },
  'seated leg curl': {
    feel: 'The back of your thighs, with a stretch at the start.',
    tooHeavy: ['Your hips slide forward in the seat', 'You can’t bend your knees fully', 'The stack slams back up'],
    progress: [p('squeeze', 'Squeeze at the bottom', 'Hold your knees fully bent for 2 seconds.'), p('lean', 'Lean forward', 'Lean your chest toward your thighs for a bigger hamstring stretch.')],
  },
  'hip thrust': {
    feel: 'Your glutes, squeezing hard at the top. Not your lower back.',
    tooHeavy: ['Your lower back arches at the top', 'You can’t reach a straight line from knees to shoulders', 'Your feet slide'],
    progress: [p('pause', 'Pause at the top', 'Hold 2–3 seconds with your glutes squeezed.'), p('side', 'One leg', 'Single-leg hip thrusts.'), p('band', 'Band round your knees', 'Push your knees out against it.')],
  },
  'glute bridge': {
    feel: 'Your glutes, pushing your hips up from the floor.',
    tooHeavy: ['You arch your back to get higher', 'You feel it in your hamstrings, not your glutes', 'Your hips sag before the top'],
    progress: [p('pause', 'Pause at the top', 'Hold 3 seconds with your glutes squeezed.'), p('side', 'One leg', 'Bridge on one leg.'), p('load', 'Add a weight', 'A dumbbell or plate on your hips.')],
  },
  'standing calf raise': {
    feel: 'Your calves, from a deep stretch to high on your toes.',
    tooHeavy: ['You bounce out of the bottom', 'You bend your knees to help', 'You can’t rise fully onto your toes'],
    progress: [p('pause', 'Pause at both ends', 'One second deep in the stretch, one second at the top.'), p('side', 'One leg at a time', 'Same weight, one leg.')],
  },
  'seated calf raise': {
    feel: 'Your calves, especially the lower part, with your knees bent.',
    tooHeavy: ['You bounce out of the bottom', 'The reps get short', 'You can’t rise fully'],
    progress: [p('pause', 'Pause in the stretch', '2 seconds at the bottom of every rep.'), p('reps', 'More reps', 'Work up to 20 slow reps before adding weight.')],
  },
  // Core and full body
  plank: {
    feel: 'Your abs, holding your body in one straight line from head to heels.',
    tooHeavy: ['Your hips sag or pike up', 'Your lower back aches', 'You shake hard and lose the line'],
    progress: [p('longer', 'Hold longer', 'Add 5–10 seconds each time. Past 60 s, make it harder instead.'), p('reach', 'Reach forward', 'Lift one arm out in front, then the other.'), p('feet-up', 'Feet raised', 'Feet on a bench.')],
  },
  'side plank': {
    feel: 'The side of your waist, holding your hips up.',
    tooHeavy: ['Your hips drop toward the floor', 'You roll forward or back', 'Your shoulder aches'],
    progress: [p('longer', 'Hold longer', 'Add 5–10 seconds a side.'), p('leg', 'Top leg raised', 'Lift your top leg for the whole hold.')],
  },
  'hanging leg raise': {
    feel: 'Your lower abs, curling your hips up. Not just lifting your legs.',
    tooHeavy: ['You swing to get your legs up', 'You lose your grip before your abs tire', 'Your legs stop below hip height'],
    progress: [p('straight', 'Straighter legs', 'Keep your knees straighter as you get stronger.'), p('slow', 'Slow the lowering', '3 seconds down without swinging.')],
  },
  'cable crunch': {
    feel: 'Your abs, curling your ribs toward your hips.',
    tooHeavy: ['You pull with your arms', 'You bend at the hips instead of curling your spine', 'You sit back on your heels to move it'],
    progress: [p('squeeze', 'Squeeze at the bottom', 'Hold the crunch for 2 seconds.'), p('slow', 'Slow the way up', '3 seconds back up.')],
  },
  'ab wheel rollout': {
    feel: 'Your abs, stopping your lower back from sagging as you roll out.',
    tooHeavy: ['Your lower back sags', 'Your hips stay high and you only roll a short way', 'You feel it in your lower back, not your abs'],
    progress: [p('further', 'Roll further', 'A little further each week while your back stays flat.'), p('standing', 'From standing', 'Eventually, start from your feet instead of your knees.')],
  },
  "farmer's carry": {
    feel: 'Your grip, upper back and abs, walking tall with heavy weights.',
    tooHeavy: ['You lean to one side', 'Your shoulders round forward', 'You drop the weights before the time is up'],
    progress: [p('longer', 'Walk longer', 'Add 10 seconds or 10 steps each time.'), p('side', 'One hand', 'Carry one weight: your abs fight the lean.')],
  },
  'kettlebell swing': {
    feel: 'Your glutes and hamstrings snapping your hips forward. Your arms just hold on.',
    tooHeavy: ['You lift it with your arms', 'You squat it instead of hinging', 'Your back rounds at the bottom'],
    progress: [p('reps', 'More swings', 'Add 5 swings a set, or work in rounds of 10 every minute.'), p('side', 'One hand', 'One-arm swings, switching hands each set.')],
  },
  'power clean': {
    feel: 'Your legs and hips driving the bar up fast, then your arms getting under it.',
    tooHeavy: ['You pull it up with your arms', 'You catch it with a rounded back or on your toes', 'The bar loops away from your body'],
    progress: [p('singles', 'Quality singles', 'Do single reps with a short rest: speed and position first.'), p('pause', 'Pause at the knee', 'Stop the bar just above your knees, then explode.')],
  },
  // Cardio
  run: {
    feel: 'Steady breathing and your legs. Easy runs should feel easy enough to talk.',
    tooHeavy: ['You can’t speak a short sentence on an easy run', 'Your stride gets ragged or heavy', 'Something aches more with every step'],
    progress: [p('longer', 'Run a little longer', 'Add about 10% to your longest run each week.'), p('strides', 'Strides', 'After an easy run, 4–6 fast 20-second runs with a walk between.'), p('hills', 'Hills', 'An easy route with a few hills.')],
  },
  treadmill: {
    feel: 'Steady breathing and your legs.',
    tooHeavy: ['You hold the rails to keep up', 'You can’t speak a short sentence', 'Your stride shortens and slaps'],
    progress: [p('incline', 'Add incline', 'Raise it 1–2% at the same pace.'), p('intervals', 'Intervals', '1 minute faster, 2 minutes easy, 6 times.'), p('longer', 'A little longer', 'Add 5 minutes.')],
  },
  walk: {
    feel: 'An easy, steady effort. You should be able to chat.',
    tooHeavy: ['You’re out of breath', 'Your feet or knees ache more as you go'],
    progress: [p('longer', 'Walk a little longer', 'Add 5–10 minutes.'), p('brisk', 'Brisk bursts', 'A few minutes at a brisk pace, then easy again.'), p('hills', 'Hills', 'Pick a hillier route.')],
  },
  hike: {
    feel: 'Your legs and lungs, especially uphill.',
    tooHeavy: ['You can’t talk on the climbs', 'Your knees ache on the way down'],
    progress: [p('elevation', 'More climbing', 'A route with more elevation gain.'), p('pack', 'Carry a pack', 'A few pounds more in your pack each time.')],
  },
  'bike ride': {
    feel: 'Your thighs and lungs, at a steady cadence.',
    tooHeavy: ['Your knees ache', 'You can’t keep a steady cadence', 'You’re gasping on what should be an easy ride'],
    progress: [p('longer', 'Ride a little longer', 'Add about 10% each week.'), p('hills', 'Hills', 'A route with a few climbs.'), p('intervals', 'Intervals', '1 minute hard, 2 easy, 6 times.')],
  },
  'stationary bike': {
    feel: 'Your thighs and lungs.',
    tooHeavy: ['Your knees ache', 'You bounce in the saddle', 'You can’t hold your cadence'],
    progress: [p('resistance', 'More resistance', 'One step more resistance at the same cadence.'), p('intervals', 'Intervals', '30 seconds hard, 90 easy, 8 times.'), p('longer', 'A little longer', 'Add 5 minutes.')],
  },
  'rowing machine': {
    feel: 'Your legs first, then your back, then your arms, in that order every stroke.',
    tooHeavy: ['Your back rounds at the catch', 'You pull with your arms before your legs push', 'Your stroke rate shoots up but your pace doesn’t'],
    progress: [p('split', 'A faster split', 'Take 1–2 seconds off your 500 m pace with stronger strokes, not more of them.'), p('intervals', 'Intervals', '500 m hard, 2 minutes easy, 4–6 times.')],
  },
  elliptical: {
    feel: 'Your legs and lungs, with no impact.',
    tooHeavy: ['You lean on the handles', 'You can’t speak a short sentence'],
    progress: [p('resistance', 'More resistance', 'One level more at the same pace.'), p('incline', 'Higher ramp', 'Raise the ramp a step.')],
  },
  'stair climber': {
    feel: 'Your glutes and thighs, standing tall.',
    tooHeavy: ['You lean on the rails', 'You can’t keep a steady step'],
    progress: [p('level', 'A higher level', 'One level faster for the same time.'), p('hands-free', 'Hands off', 'Climb without holding the rails.')],
  },
  swim: {
    feel: 'Your whole body, with relaxed, steady breathing.',
    tooHeavy: ['You gasp for air every stroke', 'Your stroke falls apart at the end of each length'],
    progress: [p('pace', 'Faster lengths', 'Same distance, a few seconds quicker per length.'), p('longer', 'Swim a little further', 'Add 2 lengths.')],
  },
  'jump rope': {
    feel: 'Your calves and lungs, light on your toes.',
    tooHeavy: ['You trip every few jumps', 'You land on your heels'],
    progress: [p('longer', 'Longer rounds', 'Add 15 seconds a round.'), p('doubles', 'Double-unders', 'Try a few doubles each round.')],
  },
  hiit: {
    feel: 'Hard efforts that leave you breathing heavily, with real rest between.',
    tooHeavy: ['You can’t keep your form in the work periods', 'You feel dizzy or sick'],
    progress: [p('rounds', 'One more round', 'Add a round before making the rounds harder.'), p('ratio', 'Less rest', 'Shorten the rest by 10 seconds.')],
  },
};

/** The written tips for an exercise, by name; null when it has none. */
export function tipsFor(name: string): ExerciseTips | null {
  const key = name.trim().toLowerCase();
  const lib = LIBRARY_TIPS[key];
  return TIPS[key] ?? (lib ? { feel: lib[0], tooHeavy: lib[1], progress: lib[2].map(([k, title, detail]) => p(k, title, detail)) } : null);
}
