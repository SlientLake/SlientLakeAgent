// frontend/static/topology.js
// D3.js force-directed topology graph

const API_BASE = window.API_BASE || 'http://localhost:18789';

const statusColor = {
    online: '#10B981',
    busy: '#F59E0B',
    offline: '#9CA3AF',
};

let simulation = null;

async function loadTopology() {
    try {
        const res = await fetch(API_BASE + '/api/v1/dashboard/topology');
        if (!res.ok) return;
        const data = await res.json();
        renderTopology(data);
    } catch (e) {
        console.warn('Topology fetch failed:', e);
    }
}

function renderTopology(data) {
    const svgEl = document.getElementById('topology-svg');
    if (!svgEl) return;

    const width = svgEl.clientWidth || 800;
    const height = svgEl.clientHeight || 500;

    // Clear
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    if (!data.nodes || data.nodes.length === 0) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', width / 2);
        text.setAttribute('y', height / 2);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#9ca3af');
        text.textContent = 'No agents found. Start the platform to see the topology.';
        svgEl.appendChild(text);
        return;
    }

    const svg = d3.select(svgEl);

    // Arrow marker
    const defs = svg.append('defs');
    defs.append('marker')
        .attr('id', 'arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 30)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#6B7280');

    const nodes = data.nodes.map(n => ({ ...n }));
    const links = data.links.map(l => ({ ...l }));

    if (simulation) simulation.stop();

    simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(130))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide(45));

    const link = svg.append('g')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .attr('stroke', d => d.type === 'reports_to' ? '#6B7280' : '#D1D5DB')
        .attr('stroke-width', d => d.type === 'reports_to' ? 2 : 1)
        .attr('stroke-dasharray', d => d.type === 'collaborates' ? '5,5' : 'none')
        .attr('marker-end', d => d.type === 'reports_to' ? 'url(#arrow)' : 'none');

    const node = svg.append('g')
        .selectAll('g')
        .data(nodes)
        .enter().append('g')
        .call(d3.drag()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x; d.fy = d.y;
            })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null; d.fy = null;
            })
        );

    node.append('circle')
        .attr('r', d => d.type === 'independent' ? 26 : 19)
        .attr('fill', 'white')
        .attr('stroke', d => statusColor[d.status] || '#9CA3AF')
        .attr('stroke-width', 3);

    node.append('circle')
        .attr('cx', 19).attr('cy', -19)
        .attr('r', 5)
        .attr('fill', d => statusColor[d.status] || '#9CA3AF');

    node.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 4)
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .attr('fill', '#1e293b')
        .text(d => d.id.length > 10 ? d.id.substring(0, 10) + '…' : d.id);

    // Tooltip
    node.append('title').text(d => `${d.id}\nType: ${d.type}\nStatus: ${d.status}\nGroup: ${d.group || 'default'}`);

    simulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
}

// Auto-load and refresh every 10s
loadTopology();
setInterval(loadTopology, 10000);
