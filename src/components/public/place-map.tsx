/**
 * แผนที่ของสถานที่ (แสดงเมื่อมีพิกัด) ใช้แผนที่ OpenStreetMap แบบฝัง ไม่ต้องใช้กุญแจ API
 * และมีลิงก์เปิดใน Google Maps สำหรับนำทาง
 */
export function PlaceMap({ latitude, longitude, name }: { latitude: number; longitude: number; name: string }) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const d = 0.006;
  const bbox = [lon - d, lat - d, lon + d, lat + d].map((n) => n.toFixed(6)).join(",");
  return (
    <div data-testid="place-map">
      <iframe
        title={`แผนที่ ${name}`}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-72 w-full rounded-xl border"
      />
      <p className="mt-2">
        <a
          href={`https://www.google.com/maps?q=${lat},${lon}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-4"
        >
          เปิดใน Google Maps (พิกัด {lat}, {lon})
        </a>
      </p>
    </div>
  );
}
