import { redirect } from 'next/navigation';

// Templates moved out of Admin so staff can use them too (migration 049).
export default function AdminTemplatesPage() {
  redirect('/templates');
}
