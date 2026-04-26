import { Module } from '@nestjs/common';

import { ProductReadModelModule } from '../product-read-model/product-read-model.module';

import { RecommendationController } from './recommendation.controller';
import { RecommendationService } from './recommendation.service';

@Module({
	imports: [ProductReadModelModule],
	controllers: [RecommendationController],
	providers: [RecommendationService],
})
export class RecommendationModule {}
