import * as THREE from 'three';

const TAU = Math.PI * 2;

export function buildFoliage(group, random) {
  const wood = [];
  const needles = [];
  const needleColors = [];
  const caps = [];
  const crystals = [];
  const ornaments = [];
  const shadow = new THREE.Color('#334e4d');
  const spruce = new THREE.Color('#658d94');
  const frost = new THREE.Color('#c3dce7');
  const color = new THREE.Color();
  const base = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const forkStart = new THREE.Vector3();
  const forkTip = new THREE.Vector3();
  const center = new THREE.Vector3();

  function vertex(point, tint) {
    needles.push(point.x, point.y, point.z);
    needleColors.push(tint.r, tint.g, tint.b);
  }

  function shoot(from, to, bend, season, exposure) {
    tangent.subVectors(to, from);
    const length = tangent.length();
    tangent.multiplyScalar(1 / length);
    side.set(-tangent.z, 0, tangent.x).normalize();
    up.crossVectors(side, tangent);
    center.lerpVectors(from, to, .52);
    center.y += bend;
    wood.push(from.x, from.y, from.z, center.x, center.y, center.z, center.x, center.y, center.z, to.x, to.y, to.z);
    const count = Math.round(19 + length * 50);
    const phase = random() * TAU;
    for (let i = 0; i < count; i++) {
      const along = (i + .25 + random() * .53) / count;
      const roll = phase + i * 2.399963 + (random() - .5) * .78;
      const cosine = Math.cos(roll);
      const sine = Math.sin(roll);
      const cover = Math.max(0, sine) * season;
      const needleLength = (.064 + random() * .131) * (1 - exposure * .22) * (.66 + .34 * Math.sin(along * 2.2 + .65));
      const width = (.0045 + random() * .0035) * (1 - exposure * .18);
      base.lerpVectors(from, to, along);
      base.y += Math.sin(along * Math.PI) * bend;
      radial.copy(side).multiplyScalar(cosine).addScaledVector(up, sine);
      tip.copy(base).addScaledVector(tangent, needleLength * (.39 + random() * .40)).addScaledVector(radial, needleLength * .72);
      edge.copy(side).multiplyScalar(-sine).addScaledVector(up, cosine).multiplyScalar(width);
      color.copy(shadow).lerp(spruce, .30 + random() * .38 + season * .12);
      base.add(edge);
      vertex(base, color);
      base.addScaledVector(edge, -2);
      vertex(base, color);
      color.lerp(spruce, .48 + .25 * random()).lerp(frost, cover * (.44 + random() * .46));
      vertex(tip, color);
      if (i % 8 === 0 && cover > .17) crystals.push([tip.x, tip.y + .009, tip.z]);
    }

    if (length < .16 || random() > season * .61) return;
    const clumps = length > .37 ? 3 : 2;
    for (let i = 0; i < clumps; i++) {
      const along = .22 + i * (.54 / clumps) + random() * .12;
      center.lerpVectors(from, to, along).addScaledVector(side, (random() - .5) * .058);
      center.y += .043 + Math.sin(along * Math.PI) * bend;
      caps.push({
        x: center.x, y: center.y, z: center.z, yaw: Math.atan2(-tangent.z, tangent.x), slope: tangent.y * .66,
        length: length * (.112 + random() * .124), height: .012 + random() * .027,
        width: .036 + random() * .044, tint: random(),
      });
      crystals.push([center.x, center.y + .03, center.z]);
    }
  }

  const tiers = 25;
  for (let tier = 0; tier < tiers; tier++) {
    const level = tier / (tiers - 1);
    const nextTier = tier * 2.399963;
    const y = .59 + level * 5.10;
    const envelope = .065 + 2.15 * (1 - level) ** .82;
    const count = Math.max(3, Math.round(8 - level * 4));
    for (let i = 0; i < count; i++) {
      const azimuth = nextTier + i * TAU / count + (random() - .5) * .54;
      const rootY = y + (random() - .5) * (.30 - level * .15);
      const reach = envelope * (.80 + random() * .27 + .095 * Math.sin(tier * 2.02));
      const lean = Math.sin(level * 5.8) * .072;
      const sag = (.20 - level * .10) * (.66 + random() * .69);
      const lift = .035 + random() * .095 + .13 * level;
      const branchPoint = (point, along) => point.set(
        lean + Math.cos(azimuth) * reach * along,
        rootY - Math.sin(along * 2.54) * sag + lift * along ** 4,
        Math.sin(azimuth) * reach * along,
      );
      const snowiness = .31 + random() * .43 + (i % 3 === 1 ? .16 : 0);
      const offshoots = Math.round(5 + 7 * (1 - level));
      for (let j = 0; j < offshoots; j++) {
        const along = .19 + (j + random() * .65) * .66 / offshoots;
        branchPoint(start, along);
        const spread = (j % 2 ? 1 : -1) * (.61 + random() * .55);
        const direction = azimuth + spread;
        const length = Math.min(.54, reach * .46) * (.65 + random() * .53) * (1.05 - along * .28);
        end.set(
          start.x + Math.cos(direction) * length,
          start.y + length * (.09 + random() * .35) - .034,
          start.z + Math.sin(direction) * length,
        );
        shoot(start, end, (random() - .67) * .056, snowiness, level);
        if (length > .18) {
          for (const side of [-1, 1]) {
            forkStart.lerpVectors(start, end, .45 + side * .14);
            const forkAngle = direction + side * (.43 + random() * .34);
            const branchlet = length * (.30 + random() * .28);
            forkTip.set(
              forkStart.x + Math.cos(forkAngle) * branchlet,
              forkStart.y + (random() - .18) * .13,
              forkStart.z + Math.sin(forkAngle) * branchlet,
            );
            shoot(forkStart, forkTip, -.012, snowiness * .72, level);
          }
        }
      }
      branchPoint(start, .035);
      branchPoint(end, .58);
      shoot(start, end, -.10 * (1 - level), snowiness * .69, level);
      branchPoint(start, .55);
      branchPoint(end, 1.02);
      shoot(start, end, -.036, Math.min(1, snowiness + .16), level);

      if ((tier * 3 + i) % 5 === 2 && level < .94 && random() > .12) {
        branchPoint(start, .81 + random() * .21);
        const tension = reach * .037;
        ornaments.push([start.x + Math.cos(azimuth) * tension, start.y, start.z + Math.sin(azimuth) * tension, level]);
      }
    }
  }

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.010, .099, 5.70, 12), new THREE.MeshStandardMaterial({
    color: '#38413d', roughness: .97, envMapIntensity: .25,
  }));
  trunk.position.y = 2.85;
  const bark = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wood, 3));
  group.add(trunk, new THREE.LineSegments(bark, new THREE.LineBasicMaterial({ color: '#354b4c' })));
  const foliage = new THREE.BufferGeometry();
  foliage.setAttribute('position', new THREE.Float32BufferAttribute(needles, 3));
  foliage.setAttribute('color', new THREE.Float32BufferAttribute(needleColors, 3));
  foliage.computeVertexNormals();
  group.add(new THREE.Mesh(foliage, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  const powder = new THREE.SphereGeometry(1, 10, 6);
  const surface = powder.attributes.position;
  for (let i = 0; i < surface.count; i++) {
    const x = surface.getX(i);
    const y = surface.getY(i);
    const z = surface.getZ(i);
    const texture = 1 + .13 * Math.sin(x * 6.0 + y * 2.4) + .07 * Math.cos(z * 8.3 - x * 5.0);
    surface.setXYZ(i, x * texture, y * texture, z * texture);
  }
  powder.computeVertexNormals();
  const snow = new THREE.InstancedMesh(powder,
    new THREE.MeshStandardMaterial({ color: '#abc1cf', roughness: .94, envMapIntensity: .36 }), caps.length);
  const clump = new THREE.Object3D();
  const blue = new THREE.Color('#7799ac');
  caps.forEach(({ x, y, z, yaw, slope, length, height, width, tint }, i) => {
    clump.position.set(x, y, z);
    clump.rotation.set(0, yaw, slope, 'YXZ');
    clump.scale.set(length, height, width);
    clump.updateMatrix();
    snow.setMatrixAt(i, clump.matrix);
    snow.setColorAt(i, color.copy(blue).lerp(frost, .30 + tint * .68));
  });
  group.add(snow);
  return { crystals, ornaments };
}
