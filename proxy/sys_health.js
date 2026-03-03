require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const os = require('os');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memPct = ((memTotal - memFree) / memTotal) * 100;
    
    const cpuLoad = Math.min((os.loadavg()[0] / os.cpus().length) * 100, 100);
    
    const { execSync } = require('child_process');
    const dfOut = execSync("df -h / | awk 'NR==2 {print $5}'").toString().trim().replace('%','');
    const diskPct = parseFloat(dfOut) || 0;

    const metrics = [
      { metric_type: 'cpu_load', value_numeric: parseFloat(cpuLoad.toFixed(2)) },
      { metric_type: 'memory_pct', value_numeric: parseFloat(memPct.toFixed(2)) },
      { metric_type: 'disk_pct', value_numeric: diskPct }
    ];

    const { error } = await supabase.from('system_metrics').insert(metrics);
    if (error) console.error("Error inserting system metrics:", error);
    else console.log("System metrics logged successfully.");
    
  } catch (err) {
    console.error(err);
  }
}
run();
