import React, { useEffect, useState } from 'react';
import CityScene from './components/CityScene.tsx';
import RelationshipGraph from './features/relationship/RelationshipGraph.tsx';

const useHashRoute = () => {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
};

export default function Home() {
  const hash = useHashRoute();

  if (hash.startsWith('#/relationship')) {
    return (
      <main className="h-screen w-screen overflow-hidden bg-[#0e1732] font-body">
        <RelationshipGraph />
      </main>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#0e1732] font-body">
      <CityScene />
    </main>
  );
}
