import { redirect } from 'next/navigation';

/**
 * The projects dashboard arrives with the storage layer in M6, and the
 * marketing route with the ship pass in M11. Until then the root goes
 * straight to the editor — there is nothing to choose between yet.
 */
export default function Home() {
  redirect('/app/scratch');
}
