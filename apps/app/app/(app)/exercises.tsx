import { router } from 'expo-router';
import { ExercisePicker } from '../../components/ExercisePicker';

/** Browse the exercise library; tapping one opens its records and history. */
export default function Exercises() {
  return (
    <ExercisePicker
      inline
      visible
      title="Exercises"
      onPick={(e) => router.push({ pathname: '/exercise', params: { id: e.id } })}
      onClose={() => router.back()}
    />
  );
}
