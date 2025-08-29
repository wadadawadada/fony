// level1.js
export default function() {
  return {
    width: 10,
    height: 8,
    player: { x: 0, y: 0 },
    objects: [
      { type: "enemy",  x: 2, y: 1 },
      { type: "enemy",  x: 5, y: 4 },
      { type: "enemy",  x: 7, y: 2 },
      { type: "scroll", x: 4, y: 2 },
      { type: "scroll", x: 1, y: 6 },
      { type: "potion", x: 8, y: 1 },
      { type: "heart",  x: 2, y: 5 },
      { type: "sword",  x: 7, y: 6 },
      { type: "shield", x: 3, y: 3 },
      { type: "door",   x: 9, y: 7 }
    ]
  }
}
