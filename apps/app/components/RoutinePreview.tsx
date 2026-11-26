// What a workout holds before you start it: each movement's picture, name and
// sets × reps (like Ladder's preview). Used on Train and when planning a day.
import { StyleSheet, Text, View } from 'react-native';
import type { Routine } from '@forkbell/shared';
import { Thumb } from './ExercisePicker';
import { color, space, type } from '../lib/theme';

export function RoutinePreview({ routine, max = 8 }: { routine: Routine; max?: number }) {
  if (!routine.exercises.length) return <Text style={type.small}>No exercises yet. Edit this day to add some.</Text>;
  const more = routine.exercises.length - max;
  return (
    <View style={{ gap: space(2) }}>
      {routine.exercises.slice(0, max).map((x, i) => (
        <View key={`${x.exercise.id}-${i}`} style={s.row}>
          <Thumb e={x.exercise} size={40} />
          <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{x.exercise.name}</Text>
          <Text style={[type.small, type.number]}>
            {x.sets} × {x.repMin === x.repMax ? x.repMin : `${x.repMin}–${x.repMax}`}
          </Text>
        </View>
      ))}
      {more > 0 && <Text style={[type.small, { color: color.ironSoft }]}>and {more} more</Text>}
    </View>
  );
}

const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: space(3) } });
