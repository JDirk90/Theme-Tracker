import SectorBar from './SectorBar';

export default function CategorySection({ category, onSectorHover, onSectorMove, onSectorLeave }) {
  return (
    <section className="category-section" id={`cat-${category.sector.replace(/\s+/g, '-')}`}>
      <div className="category-header">
        <span className="category-icon">{category.icon}</span>
        <h3 className="category-name">{category.sector}</h3>
        <span className="category-count">{category.themes.length} themes</span>
      </div>

      <div className="sector-bars">
        {category.themes.map((theme) => (
          <SectorBar
            key={theme.name}
            sector={theme}
            categoryColor={category.color}
            onHover={onSectorHover}
            onMove={onSectorMove}
            onLeave={onSectorLeave}
          />
        ))}
      </div>
    </section>
  );
}
