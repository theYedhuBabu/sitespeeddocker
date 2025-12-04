const { InfluxDB, Point } = require('@influxdata/influxdb-client');

const influxUrl = process.env.INFLUXDB_URL || 'http://influxdb:8086';
const influxToken = process.env.INFLUX_TOKEN || process.env.DOCKER_INFLUXDB_INIT_ADMIN_TOKEN || 'my-super-secret-auth-token';
const influxOrg = process.env.INFLUX_ORG || process.env.DOCKER_INFLUXDB_INIT_ORG || 'my-org';
const influxBucket = process.env.INFLUX_BUCKET || process.env.DOCKER_INFLUXDB_INIT_BUCKET || 'sitespeed';

console.log(`InfluxDB configured with URL: ${influxUrl}, Org: ${influxOrg}, Bucket: ${influxBucket}`);

const influxDB = new InfluxDB({ url: influxUrl, token: influxToken });
const queryApi = influxDB.getQueryApi(influxOrg);

// Factory function to get a write API instance (should be closed after use)
const getWriteApi = () => influxDB.getWriteApi(influxOrg, influxBucket);

module.exports = {
    influxDB,
    queryApi,
    getWriteApi,
    Point,
    influxOrg,
    influxBucket
};
