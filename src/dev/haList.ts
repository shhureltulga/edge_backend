import { listAreas } from '../utils/ha';
(async () => {
  const areas = await listAreas();
  console.log('HA areas:', areas.map(a => a.name));
})();