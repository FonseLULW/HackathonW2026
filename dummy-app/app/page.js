import { getStateSnapshot } from "../lib/store";

import Storefront from "./storefront";

export const dynamic = "force-dynamic";

export default function Home() {
  const snapshot = getStateSnapshot();
  return <Storefront initialSnapshot={snapshot} />;
}
