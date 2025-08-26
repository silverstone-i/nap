import React from 'react';
import { Grid, Card, CardHeader, CardContent, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts';

// Dummy data for demonstration.  Replace with real data fetched
// from the backend using React Query when implementing.
const metrics = [
  { title: 'Total Budget', value: '$1,200,000' },
  { title: 'Actual Costs', value: '$950,000' },
  { title: 'Change Orders', value: '$50,000' },
  { title: 'Variance', value: '$200,000' },
  { title: 'Gross Margin', value: '20%' }
];

const barData = [
  { name: 'Project A', budget: 300, actual: 250 },
  { name: 'Project B', budget: 500, actual: 450 },
  { name: 'Project C', budget: 400, actual: 350 }
];

export default function DashboardPage() {
  return (
    <div>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Grid container spacing={2}>
        {metrics.map((metric) => (
          <Grid item xs={12} sm={6} md={4} key={metric.title}>
            <Card>
              <CardHeader title={metric.title} />
              <CardContent>
                <Typography variant="h5" component="div">
                  {metric.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
        Budget vs Actual by Project
      </Typography>
      <BarChart
        xAxis={[{ data: barData.map((row) => row.name), scaleType: 'band' }]}
        series={[
          { name: 'Budget', data: barData.map((row) => row.budget) },
          { name: 'Actual', data: barData.map((row) => row.actual) }
        ]}
        width={600}
        height={300}
      />
    </div>
  );
}