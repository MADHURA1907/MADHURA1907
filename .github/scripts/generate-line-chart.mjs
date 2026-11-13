
import fs from "node:fs";
import path from "node:path";

const username = process.env.USERNAME;
const token = process.env.GITHUB_TOKEN;

if (!username || !token) {
  throw new Error("USERNAME and GITHUB_TOKEN are required.");
}

const days = 90;
const endDate = new Date();
const startDate = new Date(endDate);
startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

const formatDate = (date) => date.toISOString().slice(0, 10);

const query = `
  query($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query,
    variables: {
      username,
      from: `${formatDate(startDate)}T00:00:00Z`,
      to: `${formatDate(endDate)}T23:59:59Z`,
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub API error: ${response.status}`);
}

const result = await response.json();

if (result.errors) {
  throw new Error(JSON.stringify(result.errors));
}

const calendar =
  result.data.user.contributionsCollection.contributionCalendar;

const contributions = calendar.weeks
  .flatMap((week) => week.contributionDays)
  .filter((day) => day.date >= formatDate(startDate))
  .map((day) => ({
    date: day.date,
    count: day.contributionCount,
  }));

const total = contributions.reduce((sum, day) => sum + day.count, 0);
const activeDays = contributions.filter((day) => day.count > 0).length;
const peak = Math.max(...contributions.map((day) => day.count));

const width = 1120;
const height = 350;

const left = 65;
const right = 35;
const top = 85;
const bottom = 65;

const chartWidth = width - left - right;
const chartHeight = height - top - bottom;

const maxValue = Math.max(5, Math.ceil(peak / 5) * 5);

const points = contributions.map((day, index) => ({
  x: left + (index / (contributions.length - 1)) * chartWidth,
  y: top + chartHeight - (day.count / maxValue) * chartHeight,
  ...day,
}));

const linePath = points
  .map((point, index) =>
    `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )
  .join(" ");

const grid = Array.from({ length: 5 }, (_, index) => {
  const value = (maxValue * index) / 4;
  const y = top + chartHeight - (index / 4) * chartHeight;

  return `
    <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"
      stroke="#64748b" stroke-opacity="0.20" stroke-dasharray="3 6"/>
    <text x="${left - 15}" y="${y + 4}" text-anchor="end"
      fill="#94a3b8" font-size="12">${Math.round(value)}</text>
  `;
}).join("");

const labels = [0, 22, 45, 67, 89].map((index) => {
  const point = points[index];
  const date = new Date(`${point.date}T00:00:00Z`);
  const label = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return `
    <text x="${point.x}" y="${height - 25}" text-anchor="middle"
      fill="#94a3b8" font-size="12">${label}</text>
  `;
}).join("");

const last = points[points.length - 1];

const svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}">

  <rect width="100%" height="100%" rx="18" fill="#0d1117"/>

  <text x="${left}" y="35"
    fill="#f1f5f9" font-size="22" font-weight="700">
    GitHub Contribution Trend
  </text>

  <text x="${left}" y="59"
    fill="#94a3b8" font-size="12">
    @${username} · Last 90 days
  </text>

  <text x="${width - right}" y="35"
    fill="#a78bfa" font-size="15" text-anchor="end">
    ${total} contributions
  </text>

  <text x="${width - right}" y="59"
    fill="#94a3b8" font-size="12" text-anchor="end">
    ${activeDays} active days · Peak ${peak}
  </text>

  ${grid}

  <path d="${linePath}"
    fill="none"
    stroke="#a78bfa"
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"/>

  <circle cx="${last.x}" cy="${last.y}" r="5"
    fill="#a78bfa" stroke="#0d1117" stroke-width="3"/>

  ${labels}

</svg>
`;

const outputDirectory = "activity-dist";
fs.mkdirSync(outputDirectory, { recursive: true });


fs.writeFileSync(
  path.join(outputDirectory, "activity-data.json"),
  JSON.stringify(
    {
      username,
      days: contributions,
      total,
      activeDays,
      peak,
    },
    null,
    2
  )
);


fs.writeFileSync(
  path.join(outputDirectory, "activity-line.svg"),
  svg.trim()
);

console.log("Contribution line chart generated successfully.");
console.log(`Total: ${total} | Active days: ${activeDays} | Peak: ${peak}`);
